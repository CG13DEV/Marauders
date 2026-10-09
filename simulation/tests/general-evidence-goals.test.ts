import test from 'node:test';
import assert from 'node:assert/strict';
import {createPersistentSimulation,restoreCheckpoint,restoreSimulation}
  from '../src/core/persistence.ts';
import type {SocialStyle} from '../src/core/daily-life.ts';

function fixture(style:SocialStyle='reserved'){
  const w=createPersistentSimulation();
  const office=w.room('office','Комната отдыха');
  const passage=w.room('passage','Переход');
  const hall=w.room('hall','Галерея');
  w.connect(office,passage);
  w.connect(passage,hall);
  const actor=w.character('curious','Любопытный ученик',office);
  const culprit=w.character('culprit','Нарушитель',hall);
  const witness=w.character('witness','Очевидец',hall);
  const vase=w.fragileObject('vase','Ваза',hall);
  w.setGuarded(culprit,true);
  w.setDailyLife(actor,{
    homeRoom:hall,diningRoom:hall,style,interest:'castle',
    intentionPlanning:true,evidenceInquiry:true
  });
  assert.equal(w.execute({type:'break_object',actor:culprit,target:vase}).ok,true);
  // The actor was TWO passages away during breakage.
  assert.equal(w.beliefs(actor).length,0);
  assert.ok(!w.observations(actor).some(o=>o.kind==='witnessed_breakage'));
  assert.equal(w.execute({type:'move',actor,destination:passage}).ok,true);
  assert.equal(w.execute({type:'move',actor,destination:hall}).ok,true);
  return {w,actor,culprit,witness,vase,hall,office};
}

for(const style of ['reserved','outgoing'] as const){
  test(`#25: ${style} pupil creates a real lead from local damage and interviews independently`,()=>{
    const {w,actor,culprit,witness,vase}=fixture(style);
    const rejected=w.execute({type:'intend_inquire',actor,object:vase});
    assert.deepEqual(rejected,{ok:false,reason:'no_local_evidence',events:[]});
    for(let i=0;i<10&&!w.beliefs(actor).length;i++)w.step();
    const goal=w.intentionHistory(actor).find(g=>g.kind==='inquire');
    assert.equal(goal?.object,vase);
    assert.equal(goal?.status,'completed');
    assert.deepEqual(goal?.questioned,[culprit,witness]);
    const observations=w.observations(actor);
    assert.ok(observations.some(o=>o.kind==='inspected_object'&&
      o.target===vase&&o.broken));
    assert.ok(!observations.some(o=>o.kind==='witnessed_breakage'));
    const qs=w.events().filter(e=>e.type==='question_asked'&&e.actor===actor);
    assert.deepEqual(qs.map(e=>e.type==='question_asked'
      ?[e.listener,e.answered]:null),[[culprit,false],[witness,true]]);
    const belief=w.beliefs(actor)[0]!;
    assert.equal(belief.claim.culprit,culprit);
    assert.equal(belief.evidence.kind,'testimony');
    if(belief.evidence.kind==='testimony'){
      assert.equal(belief.evidence.speaker,witness);
      assert.deepEqual(belief.evidence.origin,{kind:'vision'});
    }
    const before=qs.length;
    for(let i=0;i<8;i++)w.step();
    assert.equal(w.events().filter(e=>e.type==='question_asked'&&e.actor===actor).length,before,
      'completed inquiry never re-asks the same incident');
    assert.equal(w.intentionHistory(actor).filter(g=>g.kind==='inquire').length,1);
  });
}

test('#25: unanswered leads wait without psychic witness search, and V1/V2 continue deterministically',()=>{
  const {w,actor,culprit,witness}=fixture();
  // The guilty, guarded student is encountered before the truthful witness.
  for(let i=0;i<12;i++){
    w.step();
    const g=w.intentionHistory(actor).find(x=>x.kind==='inquire');
    if(g?.questioned?.length===1)break;
  }
  const goal=w.intentionHistory(actor).find(g=>g.kind==='inquire')!;
  assert.deepEqual(goal.questioned,[culprit]);
  assert.equal(w.beliefs(actor).length,0);
  assert.equal(goal.status,'paused');
  const cp=restoreCheckpoint(w.checkpoint());
  const jr=restoreSimulation(w.snapshot());
  assert.deepEqual(cp.captureRuntime(),w.captureRuntime());
  assert.deepEqual(jr.captureRuntime(),w.captureRuntime());
  for(let i=0;i<8;i++){w.step();cp.step();jr.step();}
  assert.deepEqual(cp.captureRuntime(),w.captureRuntime());
  assert.deepEqual(jr.captureRuntime(),w.captureRuntime());
  assert.equal(w.beliefs(actor)[0]?.claim.culprit,culprit);
  assert.deepEqual(w.intentionHistory(actor).find(g=>g.kind==='inquire')?.questioned,
    [culprit,witness]);
});

test('#25: player manual control cannot be commandeered by NPC goal generation',()=>{
  const {w,actor,vase}=fixture();
  w.setManualControl(actor,true);
  for(let i=0;i<8;i++)w.step();
  assert.deepEqual(w.intentionHistory(actor),[]);
  assert.equal(w.observations(actor).some(o=>o.kind==='inspected_object'),false);
  assert.equal(w.execute({type:'intend_inquire',actor,object:vase}).ok,false);
  assert.equal(w.execute({type:'inspect_object',actor,target:vase}).ok,true);
  assert.equal(w.execute({type:'intend_inquire',actor,object:vase}).ok,true);
  assert.equal(w.intentionHistory(actor)[0]?.kind,'inquire');
  const at=w.intentionHistory(actor)[0]?.questioned;
  assert.deepEqual(at,[]);
  for(let i=0;i<3;i++)w.step();
  assert.equal(w.events().filter(e=>e.type==='question_asked'&&e.actor===actor).length,0);
});

test('#25: an agent without evidenceInquiry flag never automatically inspects or creates inquiry',()=>{
  const {w,actor,vase,hall}=fixture();
  w.setDailyLife(actor,{homeRoom:hall,diningRoom:hall,
    style:'reserved',interest:'castle',intentionPlanning:true});
  for(let i=0;i<8;i++)w.step();
  assert.ok(!w.intentionHistory(actor).some(x=>x.kind==='inquire'));
  assert.ok(!w.observations(actor).some(o=>o.kind==='inspected_object'&&o.target===vase));
});
