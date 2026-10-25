import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersistentSimulation, serializeCheckpoint, restoreCheckpoint, restoreSimulation } from '../src/core/persistence.ts';

function schoolWithConsequences() {
  const w=createPersistentSimulation();
  const classroom=w.room('classroom','Класс');
  const hallway=w.room('hallway','Коридор');
  const door=w.connect(classroom,hallway,{door:{key:'door',label:'Дверь',open:false}})!;
  const lily=w.character('lily','Лили',classroom);
  const remus=w.character('remus','Ремус',hallway);
  const james=w.character('james','Джеймс',classroom);
  const cup=w.fragileObject('cup','Чашка',classroom);
  const teacher=w.character('charms_teacher','Преподаватель чар',classroom);
  w.seedSpellKnowledge(teacher,'lumos','independent');
  w.setManualControl(teacher,true);
  w.setTimetable(lily,[{
    id:'charms', subject:'Чары',room:classroom,teacher,startsAt:510,endsAt:550,spell:'lumos'
  }]);
  w.setTimetable(remus,[{
    id:'charms', subject:'Чары',room:classroom,startsAt:510,endsAt:550,spell:'lumos'
  }], 'inquiry_first');
  w.setTrust(remus,lily,'trusted');
  w.setHelpful(lily,true);
  w.setHelpSeeking(remus,true);
  w.setGuarded(james,true);
  w.setInquisitive(remus,true);
  assert.equal(w.execute({type:'break_object',actor:james,target:cup}).ok,true);
  assert.equal(w.execute({type:'open_door',actor:lily,door}).ok,true);
  return {w,classroom,hallway,door,lily,remus,james,cup};
}

test('materialized checkpoint contains no historical ticks or commands and restores time directly', () => {
  const {w}=schoolWithConsequences();
  for(let i=0;i<1008;i++)w.step();
  const saved=w.checkpoint();
  assert.equal(saved.version,2);
  assert.equal(saved.runtime.tick,1008);
  assert.equal(saved.setup.filter(x=>x.kind==='connect').length,1);
  assert.equal(saved.setup.filter(x=>(x as {kind:string}).kind==='step').length,0);
  const restored=restoreCheckpoint(serializeCheckpoint(w));
  assert.equal(restored.tick(),1008);
  assert.equal(restored.clock().day,8);
  assert.equal(JSON.stringify(restored.captureRuntime()),JSON.stringify(w.captureRuntime()));
  for(let i=0;i<10;i++){restored.step();w.step();}
  assert.equal(JSON.stringify(restored.captureRuntime()),JSON.stringify(w.captureRuntime()));
});

test('checkpoint restores private observations, testimony, flags, spell learning and positions', () => {
  const {w,lily,remus,james,cup,classroom}=schoolWithConsequences();
  w.setManualControl(remus,true); // deliberately absent at the instruction tick
  for(let i=0;i<7;i++) w.step();
  w.execute({type:'move',actor:remus,destination:classroom});
  w.execute({type:'tell',actor:lily,listener:remus,
    claim:{kind:'broke_object',culprit:james,object:cup}});
  w.execute({type:'ask_tutoring',actor:remus,listener:lily,spell:'lumos'});
  const saved=w.checkpoint();
  const restored=restoreCheckpoint(saved);
  assert.equal(JSON.stringify(restored.captureRuntime()),JSON.stringify(w.captureRuntime()));
  assert.deepEqual(restored.beliefs(restored.id('remus')!),w.beliefs(remus));
  assert.equal(restored.tutoringRequest(restored.id('remus')!)?.helper,restored.id('lily'));
  assert.equal(restored.trustOf(restored.id('remus')!,restored.id('lily')!),'trusted');
  assert.equal(restored.isBroken(restored.id('cup')!),true);
  assert.equal(restored.spellStage(restored.id('lily')!,'lumos'),'conceptual');
  w.step();restored.step();
  assert.equal(JSON.stringify(restored.captureRuntime()),JSON.stringify(w.captureRuntime()));
});

test('after V2 restore a new checkpoint captures subsequent actions without replaying old history', () => {
  const {w}=schoolWithConsequences();
  for(let i=0;i<50;i++) w.step();
  const restored=restoreCheckpoint(w.checkpoint());
  restored.step();
  restored.setRoutine(restored.id('lily')!,[restored.id('hallway')!]);
  const second=restoreSimulation(serializeCheckpoint(restored));
  assert.equal(second.tick(),51);
  assert.equal(JSON.stringify(second.captureRuntime()),JSON.stringify(restored.captureRuntime()));
  assert.throws(()=>restored.snapshot(),/no complete replay journal/);
});

test('saving cannot mutate live ECS state; corrupted checkpoints fail closed', () => {
  const {w,remus}=schoolWithConsequences();
  w.step();
  const original=w.captureRuntime();
  const save=w.checkpoint();
  save.runtime.tick=999;
  save.runtime.observations[0]?.[1].push({kind:'heard_crash',source:'hearing'});
  assert.equal(w.tick(),1);
  assert.equal(JSON.stringify(w.captureRuntime()),JSON.stringify(original));
  const missing=w.checkpoint();
  missing.setup.splice(0,1);
  assert.throws(()=>restoreCheckpoint(missing));
  assert.throws(()=>restoreCheckpoint(JSON.stringify({version:2,format:'wrong'})));
});

test('one V2 checkpoint can restore into two independent futures', () => {
  const {w}=schoolWithConsequences();
  for(let i=0;i<12;i++)w.step();
  const saved=serializeCheckpoint(w);
  const a=restoreCheckpoint(saved), b=restoreCheckpoint(saved);
  a.step();b.step();
  assert.equal(JSON.stringify(a.captureRuntime()),JSON.stringify(b.captureRuntime()));
  a.setManualControl(a.id('lily')!,true);
  assert.notEqual(JSON.stringify(a.captureRuntime()),JSON.stringify(b.captureRuntime()));
});


test('#30.8: V2 restore safely handles a history larger than JS argument limits',()=>{
  const w=createPersistentSimulation();
  const room=w.room('room','Комната');
  const actor=w.character('pupil','Ученик',room);
  const state=w.checkpoint();
  const COUNT=160_000;
  // Synthetic valid events isolate the stack limit without simulating every
  // intervening physical step. The seven-day integration soak uses real events.
  state.runtime.events=Array.from({length:COUNT},(_,minute)=>({
    type:'rest_recorded' as const,actor,minute
  }));
  const restored=restoreCheckpoint(state);
  const events=restored.events();
  assert.equal(events.length,COUNT);
  assert.deepEqual(events[0],{type:'rest_recorded',actor,minute:0});
  assert.deepEqual(events.at(-1),{type:'rest_recorded',actor,minute:COUNT-1});
});
