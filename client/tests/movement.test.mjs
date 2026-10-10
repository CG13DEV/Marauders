import test from 'node:test';
import assert from 'node:assert/strict';
import {STARTS,walkable,safeSpawn,moveWithCollision}
  from '../src/movement.js';

const common={
  radius:10,
  obstacles:[
    {x:0,z:2.3,r:1.2}, // central couch (previous player spawn!)
    {x:0,z:-.5,r:1.1}, // coffee table
    {x:-7,z:0,r:1.37}, {x:7,z:0,r:1.37}
  ]
};
test('regression: original common-room spawn was INSIDE sofa collision',()=>{
  assert.equal(walkable(common,0,3.3),false);
  assert.equal(walkable(common,STARTS.common.x,STARTS.common.z),true);
});
test('WASD advances the character immediately from the new spawn',()=>{
  const start=safeSpawn(common,STARTS.common);
  // At default 45-degree view, W is toward negative X and negative Z.
  const next=moveWithCollision(common,start,-.11,-.11);
  assert.ok(next.x<start.x);
  assert.ok(next.z<start.z);
  assert.ok(walkable(common,next.x,next.z));
});
test('a future furniture rearrangement cannot trap a spawn',()=>{
  const collision={radius:6,obstacles:[{x:0,z:4.65,r:1.5}]};
  assert.equal(walkable(collision,0,4.65),false);
  const spawn=safeSpawn(collision,STARTS.common);
  assert.ok(walkable(collision,spawn.x,spawn.z));
});
test('collision slides along furniture instead of walking through it',()=>{
  const s={radius:10,obstacles:[{x:0,z:0,r:1.2}]};
  assert.deepEqual(moveWithCollision(s,{x:1.6,z:0},-.2,.2),{x:1.6,z:.2});
  assert.equal(walkable(s,1.1,0),false);
});
