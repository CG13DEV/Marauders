import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/Simulation.ts';
import {createPersistentSimulation,restoreCheckpoint,restoreSimulation}
  from '../src/core/persistence.ts';
import {createSchoolWeek} from '../src/scenarios/school-week.ts';

function scene(){
  const w=createPersistentSimulation();
  const hall=w.room('hall','Холл'),office=w.room('office','Кабинет');
  w.connect(hall,office);
  const culprit=w.character('culprit','Виновник',hall);
  const blamed=w.character('blamed','Обвиняемый',hall);
  const witness=w.character('witness','Свидетель',hall);
  const professor=w.character('professor','Профессор',office);
  const student=w.character('student','Ученик факультета',office);
  const bystander=w.character('bystander','Неосведомлённый',hall);
  w.registerHouse(culprit,'gryffindor');
  w.registerHouse(blamed,'gryffindor');
  w.registerHouse(witness,'slytherin');
  w.registerHouse(student,'gryffindor');
  w.registerHouse(bystander,'ravenclaw');
  w.grantPointAuthority(professor,'teacher');
  const vase=w.fragileObject('vase','Ваза',hall);
  return {w,hall,office,culprit,blamed,witness,professor,student,bystander,vase};
}
test('a staff member may penalise only a personally supported, possibly false allegation',()=>{
  const {w,office,culprit,blamed,witness,professor,student,bystander,vase}=scene();
  assert.equal(w.execute({type:'break_object',actor:culprit,target:vase}).ok,true);
  const cmd={type:'decide_house_points' as const,actor:professor,pupil:blamed,
    delta:-20,reason:'Разбил вазу',basis:{kind:'breakage_claim' as const,object:vase}};
  assert.deepEqual(w.execute(cmd),{ok:false,reason:'missing_evidence',events:[]});
  assert.equal(w.execute({...cmd,actor:witness}).ok,false);
  assert.equal(w.execute({type:'move',actor:witness,destination:office}).ok,true);
  assert.equal(w.execute({type:'tell',actor:witness,listener:professor,
    claim:{kind:'broke_object',culprit:blamed,object:vase}}).ok,true);
  assert.equal(w.execute(cmd).ok,true);
  assert.deepEqual(w.housePoints(),{gryffindor:-20,ravenclaw:0,hufflepuff:0,slytherin:0});
  assert.deepEqual(w.pointHistory()[0]?.evidence,{kind:'testimony',object:vase,speaker:witness});
  assert.equal(w.pointHistory()[0]?.pupil,blamed);
  assert.equal(w.execute(cmd).ok,false);
  assert.equal(w.knownPointNews(student)[0]?.source,'hearing');
  assert.equal(w.pointReactions(student)[0]?.stance,'resentful');
  assert.equal(w.knownPointNews(culprit).length,0);
  assert.equal(w.knownPointNews(bystander).length,0);
  assert.equal(w.execute({type:'share_house_points',actor:bystander,listener:culprit,
    decisionId:1}).ok,false);
});
test('gossip shares one known decision by proximity without reading global ledger',()=>{
  const {w,office,culprit,blamed,witness,professor,student,bystander,vase}=scene();
  w.execute({type:'break_object',actor:culprit,target:vase});
  w.execute({type:'move',actor:witness,destination:office});
  w.execute({type:'tell',actor:witness,listener:professor,
    claim:{kind:'broke_object',culprit:blamed,object:vase}});
  w.execute({type:'decide_house_points',actor:professor,pupil:blamed,delta:-10,
    reason:'Свидетель сообщил о порче',basis:{kind:'breakage_claim',object:vase}});
  assert.equal(w.knownPointNews(culprit).length,0);
  assert.equal(w.execute({type:'move',actor:student,destination:w.id('hall')!}).ok,true);
  assert.equal(w.execute({type:'chat',actor:student,listener:culprit,topic:'castle'}).ok,true);
  assert.equal(w.knownPointNews(culprit)[0]?.source,'testimony');
  assert.equal(w.knownPointNews(culprit)[0]?.speaker,student);
  assert.equal(w.pointReactions(culprit)[0]?.stance,'resentful');
  assert.equal(w.knownPointNews(bystander).length,0);
  const copy=w.knownPointNews(culprit);copy[0]!.reason='injected';
  assert.notEqual(w.knownPointNews(culprit)[0]?.reason,'injected');
});
test('co-located visible merit grants bounded points, with authority and context gates',()=>{
  const {w,office,blamed,professor,student,vase}=scene();
  const cmd={type:'decide_house_points' as const,actor:professor,pupil:blamed,
    delta:15,reason:'Помощь на уроке',basis:{kind:'observed_merit' as const}};
  assert.deepEqual(w.execute(cmd),{ok:false,reason:'missing_evidence',events:[]});
  assert.equal(w.execute({type:'move',actor:blamed,destination:office}).ok,true);
  assert.equal(w.execute(cmd).ok,true);
  assert.equal(w.housePoints().gryffindor,15);
  assert.equal(w.pointReactions(student)[0]?.stance,'proud');
  assert.equal(w.pointReactions(blamed)[0]?.stance,'proud');
  assert.deepEqual(w.execute({...cmd,delta:100}),{ok:false,reason:'invalid_points',events:[]});
  assert.deepEqual(w.execute({...cmd,reason:' '}),
    {ok:false,reason:'invalid_reason',events:[]});
  assert.equal(w.pointHistory()[0]?.evidence.kind,'direct_merit');
});
test('institutional history and rumors survive V1 replay, V2 snapshot and world stepping',()=>{
  const {w,office,culprit,blamed,witness,professor,student,vase}=scene();
  w.execute({type:'break_object',actor:culprit,target:vase});
  w.execute({type:'move',actor:witness,destination:office});
  w.execute({type:'tell',actor:witness,listener:professor,
    claim:{kind:'broke_object',culprit:blamed,object:vase}});
  w.execute({type:'decide_house_points',actor:professor,pupil:blamed,
    delta:-12,reason:'Ложный донос',basis:{kind:'breakage_claim',object:vase}});
  w.execute({type:'move',actor:student,destination:w.id('hall')!});
  w.execute({type:'share_house_points',actor:student,listener:culprit,decisionId:1});
  for(let i=0;i<3;i++)w.step();
  const v1=restoreSimulation(w.snapshot()),v2=restoreCheckpoint(w.checkpoint());
  assert.deepEqual(v1.captureRuntime(),w.captureRuntime());
  assert.deepEqual(v2.captureRuntime(),w.captureRuntime());
  for(let i=0;i<10;i++){w.step();v1.step();v2.step();}
  assert.deepEqual(v1.captureRuntime(),w.captureRuntime());
  assert.deepEqual(v2.captureRuntime(),w.captureRuntime());
});
test('expanded school has four house rosters, authorised heads and director without disturbing lessons',()=>{
  const s=createSchoolWeek(createSimulation(),'adaptive','autonomous','96-all','expanded');
  assert.equal(s.students.length,84);
  assert.equal(s.professors.length,12);
  assert.equal(s.sessions.length,155);
  assert.equal(s.students.filter(p=>s.world.houseOf(p.id)!==p.house).length,0);
  for(const head of Object.values(s.residents!.heads))
    assert.equal(s.world.execute({type:'decide_house_points',actor:head,
      pupil:s.students[0]!.id,delta:5,reason:'За старание',
      basis:{kind:'observed_merit'}}).ok,false);
  const director=s.world.id('headmaster_dumbledore')!;
  const student=s.students[0]!;
  assert.equal(s.world.execute({type:'decide_house_points',
    actor:director,pupil:student.id,delta:-5,reason:'Без информации',
    basis:{kind:'breakage_claim',object:s.layout.library}}).ok,false);
});
test('independent worlds do not leak house scores or disciplinary news',()=>{
  const a=scene(),b=scene();
  a.w.execute({type:'move',actor:a.blamed,destination:a.office});
  a.w.execute({type:'decide_house_points',actor:a.professor,pupil:a.blamed,
    delta:10,reason:'Отличная работа',basis:{kind:'observed_merit'}});
  assert.equal(a.w.housePoints().gryffindor,10);
  assert.equal(b.w.housePoints().gryffindor,0);
  assert.deepEqual(b.w.pointHistory(),[]);
});
