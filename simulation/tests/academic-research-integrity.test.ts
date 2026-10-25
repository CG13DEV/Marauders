import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/Simulation.ts';
import {createPersistentSimulation,serializeCheckpoint,restoreCheckpoint,
  serializeSimulation,restoreSimulation} from '../src/core/persistence.ts';
import {MAGIC_TRIAL_LEASE_MINUTES} from '../src/core/magic-research.ts';

const pattern={nodes:[{kind:'levitate' as const,controller:'position_lock' as const,
  trajectory:{kind:'hold' as const,point:{x:0,y:2,z:0}}}]};
function scene(world=createPersistentSimulation()){
  const lab=world.room('lab','Кабинет чар');
  const hall=world.room('hall','Коридор');
  world.connect(lab,hall);
  const a=world.character('student_a','Ученик',lab);
  const b=world.character('student_b','Другой ученик',lab);
  const feather=world.magicObject('feather','Перо',lab);
  for(const actor of [a,b]){
    world.seedSpellKnowledge(actor,'wingardium_leviosa','conceptual');
    world.seedMagicPrimitive(actor,'position_lock');
    assert.equal(world.execute({type:'propose_magic_hypothesis',actor,
      spell:'wingardium_leviosa',title:'Моя версия',pattern}).ok,true);
  }
  return {world,lab,hall,a,b,feather};
}
const run=(w:{step():unknown},steps:number)=>{for(let i=0;i<steps;i++)w.step();};

test('#78: voluntary cancellation releases a prop remotely, without fabricated evidence',()=>{
  const {world,lab,hall,a,b,feather}=scene();
  assert.equal(world.execute({type:'test_magic_hypothesis',
    actor:a,hypothesisId:1,object:feather}).ok,true);
  assert.equal(world.visibleMagicObjects(b)[0]?.busy,true);
  assert.equal(world.execute({type:'move',actor:a,destination:hall}).ok,true);
  // A departure or loss of view must NOT permit submitting false evidence.
  run(world,2);
  assert.deepEqual(world.execute({type:'record_magic_trial',actor:a,
    hypothesisId:1,object:feather}),
    {ok:false,reason:'object_not_in_reach',events:[]});
  // Actor-only instruction: no global/remote object ID or remote state required.
  const abandoned=world.execute({type:'abandon_magic_trial',actor:a});
  assert.equal(abandoned.ok,true);
  assert.equal(abandoned.events[0]?.type,'magic_trial_abandoned');
  assert.equal(world.activeMagicTrial(a),null);
  assert.equal(world.magicHypotheses(a)[0]?.trials.length,0);
  assert.equal(world.visibleMagicObjects(b)[0]?.busy,false);
  assert.deepEqual(world.execute({type:'abandon_magic_trial',actor:b}),
    {ok:false,reason:'trial_not_started',events:[]});
  assert.equal(world.execute({type:'test_magic_hypothesis',
    actor:b,hypothesisId:1,object:feather}).ok,true);
  assert.equal(world.locationOf(feather),lab);
});

test('#78: world-clock lease releases abandoned object for another pupil',()=>{
  const {world,a,b,feather,hall}=scene();
  assert.equal(world.execute({type:'test_magic_hypothesis',
    actor:a,hypothesisId:1,object:feather}).ok,true);
  world.execute({type:'move',actor:a,destination:hall});
  run(world,MAGIC_TRIAL_LEASE_MINUTES/10-1);
  assert.ok(world.activeMagicTrial(a));
  assert.equal(world.visibleMagicObjects(b)[0]?.busy,true);
  world.step();
  assert.equal(world.activeMagicTrial(a),null);
  assert.equal(world.visibleMagicObjects(b)[0]?.busy,false);
  assert.equal(world.magicHypotheses(a)[0]?.trials.length,0);
  assert.equal(world.events().filter(e=>e.type==='magic_trial_abandoned'&&
    e.actor===a&&e.cause==='expired').length,1);
  assert.equal(world.execute({type:'test_magic_hypothesis',
    actor:b,hypothesisId:1,object:feather}).ok,true);
  run(world,2);
  assert.equal(world.execute({type:'record_magic_trial',actor:b,
    hypothesisId:1,object:feather}).ok,true);
  assert.equal(world.magicHypotheses(b)[0]?.trials.length,1);
});

test('#78: in-flight checkpoint/journal replay expire identically',()=>{
  const {world,a,feather}=scene();
  world.execute({type:'test_magic_hypothesis',actor:a,hypothesisId:1,object:feather});
  run(world,2);
  const saved=serializeCheckpoint(world),journal=serializeSimulation(world);
  for(const recovered of [restoreCheckpoint(saved),restoreSimulation(journal)]){
    const student=recovered.id('student_a')!,prop=recovered.id('feather')!;
    assert.ok(recovered.activeMagicTrial(student));
    assert.equal(recovered.visibleMagicObjects(student)[0]?.busy,true);
    run(recovered,4);
    assert.equal(recovered.activeMagicTrial(student),null);
    assert.equal(recovered.visibleMagicObjects(student)[0]?.busy,false);
    assert.equal(recovered.events().filter(e=>e.type==='magic_trial_abandoned'&&
      e.cause==='expired').length,1);
    assert.equal(recovered.magicHypotheses(student)[0]?.trials.length,0);
    const roundTrip=restoreCheckpoint(serializeCheckpoint(recovered));
    assert.equal(roundTrip.visibleMagicObjects(roundTrip.id('student_a')!)[0]?.busy,false);
    assert.equal(roundTrip.magicHypotheses(roundTrip.id('student_a')!)[0]?.trials.length,0);
    assert.ok(roundTrip.magicState(prop));
  }
});

test('#78: a valid timed trial is never expired before recording',()=>{
  const {world,a,feather}=scene();
  assert.equal(world.execute({type:'test_magic_hypothesis',
    actor:a,hypothesisId:1,object:feather}).ok,true);
  run(world,2);
  assert.equal(world.execute({type:'record_magic_trial',actor:a,
    hypothesisId:1,object:feather}).ok,true);
  assert.equal(world.magicHypotheses(a)[0]?.trials.length,1);
  assert.equal(world.events().some(e=>e.type==='magic_trial_abandoned'),false);
});

test('#79: a present but unqualified teacher cannot transfer a named spell',()=>{
  const world=createSimulation(),room=world.room('r','Classroom');
  const teacher=world.character('prof','Professor',room);
  const pupil=world.character('pupil','Pupil',room);
  const lesson={id:'charms',subject:'Чары',teacher,room,
    startsAt:540,endsAt:600,spell:'lumos' as const};
  world.setTimetable(pupil,[lesson]);
  run(world,7);
  assert.equal(world.attendance(pupil)[0]?.status,'on_time');
  assert.equal(world.spellStage(pupil,'lumos'),'unaware');
  assert.equal(world.events().filter(e=>e.type==='spell_concept_learned').length,0);
});

test('#79: qualified co-present teacher, absence and primitive qualification',()=>{
  const w=createSimulation(),room=w.room('r','Classroom'),corridor=w.room('c','Hall');
  w.connect(room,corridor);
  const known=w.character('known','Professor',room);
  const ignorant=w.character('ignorant','Other Professor',room);
  const taught=w.character('taught','Student',room);
  const missed=w.character('missed','Absent',corridor);
  w.seedSpellKnowledge(known,'lumos','guided');
  w.seedMagicPrimitive(known,'position_lock');
  const a={id:'lumos',subject:'Чары',teacher:known,room,
    startsAt:540,endsAt:600,spell:'lumos' as const};
  const b={id:'primitive',subject:'Лаборатория',teacher:ignorant,room,
    startsAt:600,endsAt:660,primitive:'position_lock' as const};
  w.setTimetable(taught,[a,b]);
  w.setTimetable(missed,[a,b]);
  w.setManualControl(missed,true);
  run(w,13);
  assert.equal(w.spellStage(taught,'lumos'),'conceptual');
  assert.equal(w.spellStage(missed,'lumos'),'unaware');
  assert.deepEqual(w.knownMagicPrimitives(taught),[]);
  // The uninformed teacher was present, but nothing is conjured from a name.
  assert.equal(w.events().filter(e=>e.type==='magic_primitive_learned').length,0);
});

test('#79: teacher qualification and lesson provenance survive checkpoint/replay',()=>{
  const w=createPersistentSimulation(),room=w.room('room','Classroom');
  const teacher=w.character('teacher','Professor',room);
  const pupil=w.character('pupil','Student',room);
  w.seedSpellKnowledge(teacher,'lumos','independent');
  w.setTimetable(pupil,[{id:'lecture',subject:'Charms',room,teacher,
    startsAt:540,endsAt:590,spell:'lumos'}]);
  run(w,7);
  for(const restored of [restoreCheckpoint(serializeCheckpoint(w)),
                         restoreSimulation(serializeSimulation(w))]){
    const a=restored.id('pupil')!;
    assert.equal(restored.spellStage(a,'lumos'),'conceptual');
    assert.deepEqual(restored.learningHistory(a)[0]?.source,
      {kind:'lesson',lessonId:'lecture',minute:550});
  }
});
