import test from 'node:test';
import assert from 'node:assert/strict';
import {VIEWS,WALK_FRAMES,directionFrame,animationFrame,SPRITE_VARIANTS}
  from '../src/sprite-motion.js';
test('all eight azimuths are distinct and cyclic',()=>{
  assert.equal(VIEWS,8);
  const observed=new Set();
  for(let i=0;i<VIEWS;i++){
    const angle=i*Math.PI/4;
    const frame=directionFrame(angle,0);
    observed.add(frame);
    assert.equal(frame,i);
    assert.equal(directionFrame(angle+2*Math.PI,0),frame);
    assert.equal(directionFrame(angle,-2*Math.PI),frame);
  }
  assert.equal(observed.size,8);
  assert.equal(directionFrame(Math.PI/2,Math.PI/2),0);
  assert.equal(directionFrame(Math.PI/2,0),2);
});
test('walk cycle has four genuinely selected frames, idle stays at zero',()=>{
  assert.equal(WALK_FRAMES,4);
  assert.deepEqual([0,.12,.24,.36].map(t=>animationFrame(t,true)),
    [0,1,2,3]);
  for(const t of [0,1.3,40.5])assert.equal(animationFrame(t,false),0);
  assert.equal(VIEWS*WALK_FRAMES,32);
  assert.equal(SPRITE_VARIANTS.length,4);
});
