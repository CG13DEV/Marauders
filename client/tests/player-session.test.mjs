import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLivingRoom,PLAYER_CAST} from '../src/living-room.js';

const graph=JSON.parse(await readFile(
  new URL('../src/tower-graph.generated.json',import.meta.url),'utf8'));
const bedroom=graph.research.find(r=>r.year===7&&r.wing==='boys');

test('G1: all four Marauders become unique manually controlled ECS identities',()=>{
  for(const actor of PLAYER_CAST){
    const game=createLivingRoom(graph,{playerKey:actor.key});
    const state=game.snapshot();
    assert.equal(state.player.key,actor.key);
    assert.equal(state.player.room,graph.common.key);
    assert.ok(state.player.knownExits.includes(graph.landing.key));
    assert.equal(state.locations.length,actor.key==='peter'?4:3);
    assert.ok(!state.locations.some(([key])=>key===actor.key),
      'controlled character must never be duplicated as an NPC');
    game.advanceSeconds(600);
    assert.equal(game.snapshot().player.room,graph.common.key,
      'manual player must not be moved by autonomous daily planner');
  }
  assert.throws(()=>createLivingRoom(graph,{playerKey:'lily'}),
    /playable Marauder/);
});

test('G1: room transitions follow actual castle topology',()=>{
  const game=createLivingRoom(graph,{playerKey:'peter'});
  const original=game.snapshot().player;
  assert.ok(original.knownExits.includes(graph.landing.key));
  // Research dorms really connect DIRECTLY to common in the current graph.
  // Do not invent a forbidden edge: verify one actual permissible transition.
  const bedroomEntry=game.submit({type:'move',destination:bedroom.key});
  assert.equal(bedroomEntry.ok,true);
  assert.equal(game.snapshot().player.room,bedroom.key);
  assert.equal(game.submit({type:'move',destination:graph.common.key}).ok,true);
  const exit=game.submit({type:'move',destination:graph.landing.key});
  assert.equal(exit.ok,true);
  assert.equal(exit.player.room,graph.landing.key);
  // Landing -> bedroom has no direct edge, so ECS must reject it.
  const invalid=game.submit({type:'move',destination:bedroom.key});
  assert.equal(invalid.ok,false);
  assert.equal(game.snapshot().player.room,graph.landing.key);
  const repeated=game.submit({type:'move',destination:graph.landing.key});
  assert.equal(repeated.ok,false);
  assert.equal(game.submit({type:'move',destination:graph.common.key}).ok,true);
  assert.equal(game.snapshot().player.room,graph.common.key);
  assert.ok(game.snapshot().locations.every(([key])=>key!=='peter'));
});

test('G1.1: player observation and mischief really mutate ECS world state',()=>{
  const game=createLivingRoom(graph,{playerKey:'peter'});
  const before=game.snapshot();
  assert.equal(before.player.cup.inspected,false);
  assert.equal(before.player.cup.broken,false);
  assert.equal(game.submit({type:'inspect_cup'}).ok,true);
  const inspected=game.snapshot();
  assert.equal(inspected.player.cup.inspected,true);
  assert.equal(inspected.player.cup.broken,false);
  assert.equal(game.submit({type:'break_cup'}).ok,true);
  assert.equal(game.snapshot().player.cup.broken,true);
  assert.equal(game.submit({type:'break_cup'}).ok,false,
    'broken cup must not be broken twice');
  game.submit({type:'move',destination:graph.landing.key});
  assert.equal(game.snapshot().player.cup,undefined,
    'remote object state must not leak through the player view');
  assert.equal(game.submit({type:'inspect_cup'}).ok,false,
    'character cannot inspect remote objects');
  assert.equal(game.submit({type:'move',destination:'unknown-room'}).ok,false);
});

test('G1: world continues independently while player decides',()=>{
  const game=createLivingRoom(graph,{playerKey:'remus',warmupTicks:0});
  const initial=game.snapshot();
  const actions=game.advanceSeconds(1200);
  assert.equal(actions.snapshot.tick,2);
  assert.equal(game.snapshot().player.room,graph.common.key);
  assert.deepEqual(game.snapshot().player.key,'remus');
  assert.equal(game.snapshot().locations.length,3);
  assert.notDeepEqual(game.snapshot().locations,initial.locations,
    'remaining NPCs should still follow their timetable');
});

test('G1: public intent rejects malformed and spoofed action types',()=>{
  const game=createLivingRoom(graph);
  for(const intent of [null,{},false,{type:'cast_spell',actor:99},
    {type:'move',actor:99,destination:bedroom.key}]){
    const result=game.submit(intent);
    assert.equal(result.ok,false);
  }
  assert.equal(game.snapshot().player.key,'peter');
});
