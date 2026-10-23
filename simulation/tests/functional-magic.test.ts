import test from 'node:test';
import assert from 'node:assert/strict';
import {createFunctionalMagicSlice} from '../src/scenarios/functional-magic.ts';
import {createPersistentSimulation,restoreSimulation,restoreCheckpoint,
  serializeSimulation,serializeCheckpoint} from '../src/core/persistence.ts';
import {vec,validateMagicPattern,type MagicPattern} from '../src/core/magic-graph.ts';

const advance=(w:{step:()=>unknown},n:number)=>{for(let i=0;i<n;i++)w.step()};
const formula={spell:'wingardium_leviosa' as const,
  intent:'levitate',target:'object',incantation:'Wingardium Leviosa'};
const hold:MagicPattern={nodes:[{kind:'levitate',controller:'position_lock',
  trajectory:{kind:'hold',point:vec(0,2,0)}}]};
const feedback:MagicPattern={nodes:[{kind:'levitate',controller:'force_feedback',
  trajectory:{kind:'hold',point:vec(0,2,0)}}]};

test('school teaches a black-box spell before its implementation principles',()=>{
  const f=createFunctionalMagicSlice();
  advance(f.world,8); // 09:20, formula taught at 09:10
  assert.equal(f.world.spellStage(f.pupil,'wingardium_leviosa'),'conceptual');
  assert.deepEqual(f.world.knownMagicPrimitives(f.pupil),[]);
  assert.deepEqual(f.world.knownMagicPrimitives(f.spectator),[]);
  assert.deepEqual(f.world.execute({type:'cast_pattern',actor:f.pupil,
    object:f.feather,pattern:hold}),{ok:false,reason:'primitive_not_known',events:[]});
  assert.deepEqual(f.world.execute({type:'cast_spell',actor:f.pupil,...formula,
    object:f.feather}),{ok:false,reason:'not_practiced',events:[]});
  assert.deepEqual(f.world.execute({type:'practice_spell',actor:f.pupil,guide:f.teacher,...formula}),
    {ok:false,reason:'missing_object',events:[]});
  assert.equal(f.world.execute({type:'practice_spell',actor:f.pupil,guide:f.teacher,object:f.feather,...formula}).ok,true);
  assert.equal(f.world.execute({type:'practice_spell',actor:f.pupil,object:f.feather,...formula}).ok,true);
  assert.equal(f.world.execute({type:'cast_spell',actor:f.pupil,object:f.feather,...formula}).ok,true);
  f.world.step();
  assert.equal(f.world.magicState(f.feather)?.position.y,2);
  assert.deepEqual(f.world.knownMagicPrimitives(f.pupil),[]); // no hidden source disclosure
});

test('two legal implementations hover but diverge under an external disturbance',()=>{
  const f=createFunctionalMagicSlice();
  advance(f.world,30); // past all attended principles; omitted spectator gains none
  assert.deepEqual(f.world.knownMagicPrimitives(f.pupil),
    ['force_feedback','light_emission','position_lock']);
  assert.deepEqual(f.world.knownMagicPrimitives(f.spectator),[]);
  assert.equal(f.world.execute({type:'cast_pattern',actor:f.pupil,object:f.feather,pattern:hold}).ok,true);
  f.world.step();
  assert.equal(f.world.magicState(f.feather)?.position.y,2);
  assert.equal(f.world.execute({type:'disturb_object',actor:f.pupil,
    object:f.feather,impulse:vec(1,0,0)}).ok,true);
  f.world.step();
  assert.equal(f.world.magicState(f.feather)?.position.x,0);

  assert.equal(f.world.execute({type:'cast_pattern',actor:f.pupil,object:f.feather,pattern:feedback}).ok,true);
  for(let i=0;i<12;i++)f.world.step();
  assert.ok(Math.abs(f.world.magicState(f.feather)!.position.y-2)<0.02);
  assert.equal(f.world.execute({type:'disturb_object',actor:f.pupil,
    object:f.feather,impulse:vec(1,0,0)}).ok,true);
  f.world.step();
  assert.notEqual(f.world.magicState(f.feather)?.position.x,0);
});

test('time trajectory remains data, not a newly named spell or executable JS',()=>{
  const f=createFunctionalMagicSlice();
  advance(f.world,14); // position_lock taught at 10:10
  assert.deepEqual(f.world.knownMagicPrimitives(f.pupil),['position_lock']);
  const orbit:MagicPattern={nodes:[{kind:'levitate',controller:'position_lock',
    trajectory:{kind:'orbit',center:vec(0,0,0),radius:2,speed:Math.PI/2,height:3}},
    {kind:'light',intensity:5}]};
  assert.deepEqual(f.world.execute({type:'cast_pattern',actor:f.pupil,
    object:f.feather,pattern:orbit}),{ok:false,reason:'primitive_not_known',events:[]});
  assert.equal(f.world.execute({type:'cast_pattern',actor:f.pupil,object:f.feather,
    pattern:{nodes:[orbit.nodes[0]!]} }).ok,true);
  f.world.step();
  const first=f.world.magicState(f.feather)!;
  f.world.step();
  const second=f.world.magicState(f.feather)!;
  assert.ok(Math.abs(first.position.x)<1e-9);
  assert.ok(Math.abs(second.position.x+2)<1e-9);
  assert.equal(first.position.y,3);
  assert.equal(first.light,0);
  assert.equal(validateMagicPattern({nodes:[{kind:'levitate',
    controller:'position_lock',trajectory:{kind:'orbit',radius:Infinity}}]}),false);
  advance(f.world,17); // illumination theory
  assert.equal(f.world.execute({type:'cast_pattern',actor:f.pupil,
    object:f.feather,pattern:orbit}).ok,true);
  assert.equal(f.world.magicState(f.feather)?.light,5);
});

test('magic graph and personal primitive evidence survive journal and checkpoint',()=>{
  const persistent=createPersistentSimulation();
  const f=createFunctionalMagicSlice(persistent);
  advance(persistent,30);
  assert.equal(persistent.execute({type:'cast_pattern',actor:f.pupil,
    object:f.feather,pattern:{nodes:[...feedback.nodes,{kind:'light',intensity:3}]}}).ok,true);
  advance(persistent,4);
  const journal=serializeSimulation(persistent);
  const checkpoint=serializeCheckpoint(persistent);
  const expected=persistent.magicState(f.feather);
  for(const restored of [restoreSimulation(journal),restoreCheckpoint(checkpoint)]){
    const pupil=restored.id('pupil')!,feather=restored.id('feather')!;
    assert.deepEqual(restored.knownMagicPrimitives(pupil),persistent.knownMagicPrimitives(f.pupil));
    assert.deepEqual(restored.magicState(feather),expected);
    advance(restored,3);
    const comparison=restoreCheckpoint(checkpoint);
    advance(comparison,3);
    assert.deepEqual(restored.magicState(feather),comparison.magicState(comparison.id('feather')!));
  }
});

test('failed and forged graphs have no impact on persistent world',()=>{
  const f=createFunctionalMagicSlice();
  advance(f.world,30);
  const old=f.world.magicState(f.feather);
  assert.deepEqual(f.world.execute({type:'cast_pattern',actor:f.pupil,object:f.feather,
    pattern:{nodes:[{kind:'hack'}] as never}}),
    {ok:false,reason:'invalid_magic_pattern',events:[]});
  assert.deepEqual(f.world.execute({type:'cast_pattern',actor:f.pupil,object:f.feather,
    pattern:{nodes:[{kind:'levitate',controller:'position_lock',
      trajectory:{kind:'orbit',center:vec(0,0,0),radius:999,speed:1,height:2}}]}}),
    {ok:false,reason:'invalid_magic_pattern',events:[]});
  assert.deepEqual(f.world.magicState(f.feather),old);
});

test('guided levitation practice replays its actual feather interaction',()=>{
  const w=createPersistentSimulation();
  const f=createFunctionalMagicSlice(w);
  advance(w,8);
  assert.equal(w.execute({type:'practice_spell',actor:f.pupil,guide:f.teacher,
    object:f.feather,...formula}).ok,true);
  advance(w,1);
  const j=restoreSimulation(serializeSimulation(w));
  assert.deepEqual(j.magicState(j.id('feather')!),w.magicState(f.feather));
  assert.equal(j.spellStage(j.id('pupil')!,'wingardium_leviosa'),'guided');
});
