import test from 'node:test';
import assert from 'node:assert/strict';
import {createMagicResearchLab,held,forced} from '../src/scenarios/magic-research-lab.ts';
import {createPersistentSimulation,restoreSimulation,restoreCheckpoint,
  serializeSimulation,serializeCheckpoint} from '../src/core/persistence.ts';
import {compareMagicEvidence} from '../src/core/magic-research.ts';
import {vec} from '../src/core/magic-graph.ts';

const formula='wingardium_leviosa';
const draft=(actor:number,title:string,pattern:typeof held)=>({
  type:'propose_magic_hypothesis' as const,actor,spell:formula,title,pattern
});
const testHypothesis=(actor:number,hypothesisId:number,object:number)=>({
  type:'test_magic_hypothesis' as const,actor,hypothesisId,object
});
const record=(actor:number,hypothesisId:number,object:number)=>({
  type:'record_magic_trial' as const,actor,hypothesisId,object
});

test('G4.3 a pupil requires understanding of both the spell and its proposed primitives',()=>{
  const f=createMagicResearchLab();
  assert.deepEqual(f.world.execute(draft(f.pupil,'Удержание',held)),
    {ok:false,reason:'not_understood',events:[]});
  for(let i=0;i<8;i++)f.world.step();
  assert.equal(f.world.spellStage(f.pupil,formula),'conceptual');
  assert.deepEqual(f.world.execute(draft(f.pupil,'Удержание',held)),
    {ok:false,reason:'primitive_not_known',events:[]});
  for(let i=0;i<6;i++)f.world.step();
  assert.equal(f.world.execute(draft(f.pupil,'Удержание',held)).ok,true);
  assert.equal(f.world.magicHypotheses(f.pupil).length,1);
  assert.deepEqual(f.world.magicHypotheses(f.spectator),[]);
  // A recorded hypothesis is a personal model, not the source of Wingardium.
  assert.equal('originalStructureKnown' in f.world.magicHypotheses(f.pupil)[0]!,false);
});

test('G4.3 evidence distinguishes two levitations without guessing the original',()=>{
  const f=createMagicResearchLab();f.learnPrinciples();
  assert.equal(f.world.execute(draft(f.pupil,'Фиксация',held)).ok,true);
  assert.equal(f.world.execute(draft(f.pupil,'Управляемая сила',forced)).ok,true);
  for(const id of [1,2]){
    assert.equal(f.world.execute(testHypothesis(f.pupil,id,f.feather)).ok,true);
    assert.deepEqual(f.world.execute(record(f.pupil,id,f.feather)),
      {ok:false,reason:'trial_not_elapsed',events:[]});
    f.world.step();
    assert.equal(f.world.execute({type:'disturb_object',actor:f.pupil,
      object:f.feather,impulse:vec(1,0,0)}).ok,true);
    f.world.step();
    assert.equal(f.world.execute(record(f.pupil,id,f.feather)).ok,true);
  }
  const records=f.world.magicHypotheses(f.pupil);
  assert.equal(records.length,2);
  assert.equal(records[0]!.trials.length,1);
  assert.equal(records[1]!.trials.length,1);
  assert.equal(records[0]!.trials[0]!.after.position.x,0);
  assert.notEqual(records[1]!.trials[0]!.after.position.x,0);
  const compare=compareMagicEvidence(records[0]!.trials[0]!,records[1]!.trials[0]!);
  assert.equal(compare.sameObservedPosition,false);
  assert.ok(compare.observationDistance>0.1);
  assert.equal('originalStructureKnown' in records[0]!,false);
  assert.equal('correct' in records[0]!,false);
  const edited=f.world.magicHypotheses(f.pupil);
  edited[0]!.title='ПОДМЕНА';
  assert.equal(f.world.magicHypotheses(f.pupil)[0]!.title,'Фиксация');
  assert.deepEqual(f.world.magicHypotheses(f.spectator),[]);
});

test('G4.3 cannot observe remote targets or someone else’s replaced effect',()=>{
  const f=createMagicResearchLab();f.learnPrinciples();
  assert.equal(f.world.execute(draft(f.pupil,'Фиксация',held)).ok,true);
  assert.equal(f.world.execute(testHypothesis(f.pupil,1,f.feather)).ok,true);
  f.world.step();
  assert.equal(f.world.execute({type:'cast_pattern',actor:f.teacher,
    object:f.feather,pattern:forced}).ok,true);
  assert.deepEqual(f.world.execute(record(f.pupil,1,f.feather)),
    {ok:false,reason:'trial_interrupted',events:[]});
  assert.deepEqual(f.world.magicHypotheses(f.pupil)[0]?.trials,[]);
  assert.equal(f.world.activeMagicTrial(f.pupil),null);
});

test('G4.3 in-flight tests and observations survive journal replay and checkpoints',()=>{
  const world=createPersistentSimulation();
  const f=createMagicResearchLab(world);f.learnPrinciples();
  assert.equal(world.execute(draft(f.pupil,'Фиксация',held)).ok,true);
  assert.equal(world.execute(testHypothesis(f.pupil,1,f.feather)).ok,true);
  const checkpoint=serializeCheckpoint(world);
  const journal=serializeSimulation(world);
  for(const recovered of [restoreCheckpoint(checkpoint),restoreSimulation(journal)]){
    const actor=recovered.id('pupil')!,object=recovered.id('feather')!;
    assert.equal(recovered.activeMagicTrial(actor)?.object,object);
    recovered.step();
    assert.equal(recovered.execute(record(actor,1,object)).ok,true);
    const notes=recovered.magicHypotheses(actor);
    assert.equal(notes.length,1);assert.equal(notes[0]?.trials.length,1);
    assert.equal(notes[0]?.trials[0]?.object,object);
    assert.ok(notes[0]!.trials[0]!.after.position.y>0);
    const roundTrip=restoreCheckpoint(serializeCheckpoint(recovered));
    assert.deepEqual(roundTrip.magicHypotheses(roundTrip.id('pupil')!),notes);
  }
});

test('G4.3 evidence cannot be submitted instantly or from an unseen place',()=>{
  const f=createMagicResearchLab();f.learnPrinciples();
  assert.equal(f.world.execute(draft(f.pupil,'Фиксация',held)).ok,true);
  assert.equal(f.world.execute(testHypothesis(f.pupil,1,f.feather)).ok,true);
  const visitor=f.world.character('guest','Исследователь без зрения',f.classroom,{vision:false});
  assert.deepEqual(f.world.execute(testHypothesis(visitor,1,f.feather)),
    {ok:false,reason:'unknown_hypothesis',events:[]});
  assert.deepEqual(f.world.execute(record(f.pupil,1,f.feather)),
    {ok:false,reason:'trial_not_elapsed',events:[]});
  assert.equal(f.world.execute({type:'move',actor:f.pupil,
    destination:f.world.id('corridor')!}).ok,true);
  f.world.step();
  assert.deepEqual(f.world.execute(record(f.pupil,1,f.feather)),
    {ok:false,reason:'object_not_in_reach',events:[]});
  assert.equal(f.world.magicHypotheses(f.pupil)[0]!.trials.length,0);
});
