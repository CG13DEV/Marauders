import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/Simulation.ts';
import {createPersistentSimulation,restoreCheckpoint,restoreSimulation}
  from '../src/core/persistence.ts';
import {createSchoolWeek} from '../src/scenarios/school-week.ts';

test('need creates a real walk and a single validated toilet visit',()=>{
  const w=createPersistentSimulation();
  const corridor=w.room('corridor','Коридор',{floor:0,kind:'gallery'});
  const boys=w.room('boys','Туалет мальчиков',{floor:0,kind:'bathroom'});
  const girls=w.room('girls','Туалет девочек',{floor:0,kind:'bathroom'});
  w.connect(corridor,boys);w.connect(corridor,girls);
  const boy=w.character('boy','Ученик',corridor);
  const girl=w.character('girl','Ученица',corridor);
  w.configureToilet(boy,[boys],90);
  w.configureToilet(girl,[girls],90);
  assert.equal(w.execute({type:'use_toilet',actor:boy}).ok,false);
  const first=w.step();
  assert.equal(w.currentRoom(boy),boys);
  assert.equal(w.currentRoom(girl),girls);
  assert.ok(first.some(x=>x.actor===boy&&x.action.type==='move'));
  assert.ok(first.some(x=>x.actor===girl&&x.action.type==='move'));
  w.step();
  assert.equal(w.toiletState(boy)?.visits,1);
  assert.equal(w.toiletState(girl)?.visits,1);
  assert.equal(w.toiletState(boy)?.urgency,4);
  assert.equal(w.events().filter(e=>e.type==='toilet_used').length,2);
  assert.equal(w.execute({type:'use_toilet',actor:boy}).ok,false);
  const v1=restoreSimulation(w.snapshot()),v2=restoreCheckpoint(w.checkpoint());
  assert.deepEqual(v1.captureRuntime(),w.captureRuntime());
  assert.deepEqual(v2.captureRuntime(),w.captureRuntime());
  for(let i=0;i<3;i++){w.step();v1.step();v2.step();}
  assert.deepEqual(v1.captureRuntime(),w.captureRuntime());
  assert.deepEqual(v2.captureRuntime(),w.captureRuntime());
});
test('school duty blocks noncritical bathroom travel until there is time',()=>{
  const w=createSimulation();
  const room=w.room('lesson','Кабинет',{floor:0,kind:'classroom'});
  const toilet=w.room('toilet','Туалет',{floor:0,kind:'bathroom'});
  w.connect(room,toilet);
  const pupil=w.character('pupil','Ученик',room);
  w.configureToilet(pupil,[toilet],80);
  w.setTimetable(pupil,[{id:'lesson',subject:'ЗОТИ',room,startsAt:490,endsAt:560}]);
  w.step(); // 08:10 — until 08:50 school classroom is a commitment
  assert.equal(w.currentRoom(pupil),room);
  assert.equal(w.attendance(pupil)[0]?.status,'on_time');
  for(let i=0;i<11;i++)w.step();
  assert.equal(w.attendance(pupil)[0]?.status,'on_time');
  assert.ok(w.toiletState(pupil)!.visits>=1);
});
test('Norris cannot speak or send omniscient reports; she must meet Filch',()=>{
  const w=createPersistentSimulation();
  const office=w.room('office','Кабинет Филча');
  const hall=w.room('hall','Коридор');
  const vestibule=w.room('vestibule','Промежуточный коридор');
  w.connect(office,vestibule);
  w.connect(vestibule,hall);
  const filch=w.character('filch','Филч',office);
  const cat=w.character('norris','Норрис',hall);
  const pupil=w.character('pupil','Ученик',hall);
  const object=w.fragileObject('cup','Кружка',hall);
  w.configurePatrol(filch,'caretaker',[office]);
  w.configurePatrol(cat,'animal',[hall,office],filch,office);
  assert.deepEqual(w.execute({type:'signal_incident',actor:cat,listener:filch}),
    {ok:false,reason:'not_partner',events:[]});
  // same room, but the cat has not perceived a wrong -> no alert yet.
  assert.equal(w.execute({type:'break_object',actor:pupil,target:object}).ok,true);
  assert.deepEqual(w.execute({type:'tell',actor:cat,listener:pupil,
    claim:{kind:'broke_object',culprit:pupil,object}}),
    {ok:false,reason:'animal_action_unavailable',events:[]});
  assert.equal(w.observations(filch).some(x=>x.kind==='witnessed_breakage'),false);
  assert.equal(w.execute({type:'signal_incident',actor:cat,listener:filch}).ok,false);
  const steps1=w.step();
  assert.ok(steps1.some(x=>x.actor===cat&&x.action.type==='move'));
  assert.equal(w.currentRoom(cat),vestibule);
  const steps2=w.step();
  assert.ok(steps2.some(x=>x.actor===cat&&x.action.type==='move'));
  assert.equal(w.currentRoom(cat),office);
  const steps3=w.step();
  assert.ok(steps3.some(x=>x.actor===cat&&x.action.type==='signal_incident'));
  const alerts=w.events().filter(x=>x.type==='animal_alerted');
  assert.equal(alerts.length,1);
  assert.ok(w.observations(filch).some(x=>x.kind==='animal_alert'&&x.actor===cat));
  assert.equal(w.beliefs(filch).length,0);
  assert.equal(w.execute({type:'signal_incident',actor:cat,listener:filch}).ok,false);
  const checkpoint=restoreCheckpoint(w.checkpoint());
  const journal=restoreSimulation(w.snapshot());
  assert.deepEqual(checkpoint.captureRuntime(),w.captureRuntime());
  assert.deepEqual(journal.captureRuntime(),w.captureRuntime());
});
test('Filch may personally witness wrongdoing and report to a co-located professor, without scoring points',()=>{
  const w=createPersistentSimulation();
  const hall=w.room('hall','Коридор');
  const office=w.room('office','Кабинет');
  w.connect(hall,office,{door:{key:'office_door',label:'Дверь',open:false}});
  const filch=w.character('filch','Филч',hall);
  const teacher=w.character('teacher','Профессор',office);
  const pupil=w.character('pupil','Ученик',hall);
  const object=w.fragileObject('vase','Ваза',hall);
  w.grantPointAuthority(teacher,'teacher');
  w.registerHouse(pupil,'gryffindor');
  w.configurePatrol(filch,'caretaker',[office]);
  w.execute({type:'break_object',actor:pupil,target:object});
  assert.equal(w.beliefs(teacher).length,0);
  for(let i=0;i<6;i++)w.step();
  assert.equal(w.events().filter(x=>x.type==='testimony_delivered').length,1);
  assert.ok(w.beliefs(teacher).some(b=>b.claim.culprit===pupil&&
    b.evidence.kind==='testimony'&&b.evidence.speaker===filch));
  assert.equal(w.housePoints().gryffindor,0);
  assert.equal(w.execute({type:'decide_house_points',actor:filch,pupil,
    delta:-5,reason:'Разбитая ваза',basis:{kind:'breakage_claim',object}}).ok,false);
  assert.equal(w.execute({type:'decide_house_points',actor:teacher,pupil,
    delta:-5,reason:'Разбитая ваза',basis:{kind:'breakage_claim',object}}).ok,true);
  assert.equal(w.housePoints().gryffindor,-5);
  const cp=restoreCheckpoint(w.checkpoint()),jr=restoreSimulation(w.snapshot());
  assert.deepEqual(cp.captureRuntime(),w.captureRuntime());
  assert.deepEqual(jr.captureRuntime(),w.captureRuntime());
});
test('expanded population opts in, but experiment 20 baseline remains unchanged',()=>{
  const baseline=createSchoolWeek();
  assert.ok(baseline.students.every(s=>baseline.world.toiletState(s.id)===null));
  assert.equal(baseline.world.patrolState(baseline.world.id('student_y1_gryffindor_1')!),null);
  const expanded=createSchoolWeek(createSimulation(),'adaptive','autonomous','96-all','expanded');
  assert.equal(expanded.students.length,84);
  assert.equal(expanded.professors.length,12);
  assert.equal(expanded.sessions.length,155);
  for(const student of expanded.students){
    const need=expanded.world.toiletState(student.id);
    assert.equal(need?.bathrooms.length,9);
    assert.ok(need!.bathrooms.every(room=>
      expanded.world.roomInfo(room)?.kind==='bathroom'));
  }
  assert.equal(expanded.world.patrolState(expanded.world.id('caretaker_filch')!)?.kind,
    'caretaker');
  assert.equal(expanded.world.patrolState(expanded.world.id('mrs_norris')!)?.kind,
    'animal');
  assert.equal(expanded.world.toiletState(expanded.world.id('ghost_moaning_myrtle')!),null);
  assert.equal(expanded.world.toiletState(expanded.residents!.ghostProfessor),null);
});
test('the 105-resident week has school attendance, real toilets and patrol travel',()=>{
  const scene=createSchoolWeek(createSimulation(),'adaptive','autonomous','96-all','expanded');
  for(let i=0;i<1008;i++)scene.world.step();
  const events=scene.world.events();
  const trips=events.filter(x=>x.type==='toilet_used');
  assert.ok(trips.length>0,'pupils should actually visit toilets');
  assert.ok(trips.every(e=>e.type==='toilet_used'&&
    scene.world.roomInfo(e.room)?.kind==='bathroom'));
  assert.ok(scene.students.some(s=>scene.world.toiletState(s.id)!.visits>0));
  const filch=scene.world.id('caretaker_filch')!;
  const cat=scene.world.id('mrs_norris')!;
  assert.ok(events.some(e=>e.type==='entity_moved'&&e.actor===filch));
  assert.ok(events.some(e=>e.type==='entity_moved'&&e.actor===cat));
  assert.equal(events.filter(e=>e.type==='lesson_attendance'&&e.status==='missed').length,0);
  assert.equal(scene.students.flatMap(s=>scene.world.attendance(s.id)).filter(
    r=>r.status!=='pending').length,750);
  assert.ok(events.some(e=>e.type==='conversation_shared'));
  assert.ok(scene.students.every(s=>{
    const n=scene.world.toiletState(s.id)!;
    return n.urgency>=0&&n.urgency<=100;
  }));
});

test('live expanded school V1 and V2 continue the same patrol and toilet histories',()=>{
  const world=createPersistentSimulation();
  const school=createSchoolWeek(world,'adaptive','autonomous','96-all','expanded');
  for(let i=0;i<55;i++)world.step();
  assert.ok(school.students.some(s=>world.toiletState(s.id)!.visits>0));
  const norris=world.id('mrs_norris')!;
  const filch=world.id('caretaker_filch')!;
  assert.ok(world.patrolState(norris));
  assert.ok(world.patrolState(filch));
  const cp=restoreCheckpoint(world.checkpoint());
  const jr=restoreSimulation(world.snapshot());
  assert.deepEqual(cp.captureRuntime(),world.captureRuntime());
  assert.deepEqual(jr.captureRuntime(),world.captureRuntime());
  for(let i=0;i<20;i++){world.step();cp.step();jr.step();}
  assert.deepEqual(cp.captureRuntime(),world.captureRuntime());
  assert.deepEqual(jr.captureRuntime(),world.captureRuntime());
});
