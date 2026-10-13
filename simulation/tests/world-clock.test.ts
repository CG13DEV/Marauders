import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldClock} from '../src/core/world-clock.ts';
import {schoolTime} from '../src/core/school-time.ts';

test('RB-3.3b: school time is a projection of the same second axis',()=>{
  const clock=new WorldClock();
  assert.equal(clock.absoluteMinute(),schoolTime(0).absoluteMinute);
  clock.advanceTo(599);
  assert.equal(clock.schoolTick(),0);
  assert.equal(clock.absoluteMinute(),schoolTime(0).absoluteMinute+9);
  clock.advanceTo(600);
  assert.equal(clock.schoolTick(),1);
  assert.equal(clock.absoluteMinute(),schoolTime(1).absoluteMinute);
});
test('RB-3.3b: world time is monotonic and rejects invalid values',()=>{
  const clock=new WorldClock();
  clock.advanceBy(10);
  assert.equal(clock.advanceTo(10),10);
  assert.throws(()=>clock.advanceTo(9),/Invalid world time/);
  assert.throws(()=>clock.advanceBy(-1),/Invalid duration/);
  assert.throws(()=>clock.advanceTo(1.5),/Invalid world time/);
  assert.equal(clock.snapshot(),10);
});
test('RB-3.3b: observation frequency cannot change world time',()=>{
  const run=(samples:number)=>{
    const clock=new WorldClock();
    for(let second=1;second<=600;second++){
      clock.advanceTo(second);
      for(let frame=0;frame<samples;frame++)clock.absoluteMinute();
    }
    return [clock.snapshot(),clock.absoluteMinute(),clock.schoolTick()];
  };
  assert.deepEqual(run(1),run(144));
});
