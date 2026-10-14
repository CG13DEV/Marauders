import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomActivities} from '../../simulation/src/core/room-activities.js';
import {commonPlan} from '../src/layout-common.js';

const actors=[
 {key:'a',interest:'lessons'},
 {key:'b',interest:'castle'},
 {key:'c',interest:'castle'},
 {key:'d',interest:'lessons'}
];
const spots=new Map(actors.map(a=>[a.key,'common']));
const setup=()=>createRoomActivities({
 plan:commonPlan(),actors,commonKey:'common',nowSeconds:1000,
 initialLocations:[...spots]
});

test('RB-5.3: room occupants choose domain activities and move on world time',()=>{
  const world=setup();
  const initial=world.snapshot();
  assert.equal(initial.length,4);
  assert.ok(initial.every(a=>a.mode==='idle'));
  for(let i=0;i<100;i++)world.snapshot();
  assert.deepEqual(world.snapshot(),initial,'reads must not advance state');
  world.advanceTo(1100,[...spots]);
  const state=world.snapshot();
  assert.ok(state.some(a=>{
    const from=initial.find(s=>s.actor===a.actor);
    return Math.hypot(from.x-a.x,from.z-a.z)>1.0;
  }), 'No actual walking after one hundred game seconds');
  assert.ok(state.some(a=>a.activity==='read'));
  assert.ok(state.some(a=>a.activity==='observe'||a.activity==='rest'));
  for(const actor of state)
    assert.ok(world.walkable(actor),'NPC is overlapping furniture or a wall');
});

test('RB-5.3: room state is deterministic regardless of observation cadence',()=>{
  const once=setup(),chunks=setup();
  once.advanceTo(1700,[...spots]);
  for(let t=1010;t<=1700;t+=10)chunks.advanceTo(t,[...spots]);
  assert.deepEqual(once.snapshot(),chunks.snapshot());
});

test('RB-5.3: leaving the actual ECS room despawns the local physical actor',()=>{
  const space=setup();
  const people=[...spots].filter(([name])=>name!=='a');
  space.advanceTo(1100,people);
  assert.equal(space.snapshot().length,3);
  assert.ok(!space.snapshot().some(a=>a.actor==='a'));
  space.advanceTo(1150,[...spots]);
  assert.equal(space.snapshot().length,4);
  assert.ok(space.snapshot().some(a=>a.actor==='a'));
  assert.throws(()=>space.advanceTo(1149,[...spots]),/cannot reverse/);
});
