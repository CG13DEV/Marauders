import test from 'node:test';
import assert from 'node:assert/strict';
import {ActionTimeline} from '../src/core/action-timeline.ts';

const route=[{from:'tower',to:'stairs',seconds:120},{from:'stairs',to:'hall',seconds:120}];
test('RB-2: Peter ruins James breakfast, without erasing his goal',()=>{
  const world=new ActionTimeline();
  world.begin('james','hall',route);
  world.advance(60);
  assert.equal(world.observe('james')?.progress,0.5);
  world.interrupt('james');
  world.advance(300);
  assert.deepEqual(world.observe('james'),{goal:'hall',from:'tower',to:'stairs',
    progress:0.5,paused:true,remaining:60});
  world.resume('james');
  assert.equal(world.observe('james')?.progress,0.5);
  world.advance(360);
  assert.equal(world.observe('james')?.from,'stairs');
  world.advance(480);
  assert.equal(world.observe('james'),null);
  assert.deepEqual(world.events().filter(e=>e.kind==='arrive').map(e=>e.room),['stairs','hall']);
});
test('RB-2: observer FPS cannot alter authority or history',()=>{
  const run=(frames:number)=>{
    const world=new ActionTimeline();
    world.begin('james','hall',route);
    for(let i=1;i<=frames;i++)world.advance(240*i/frames);
    return world.events();
  };
  assert.deepEqual(run(10),run(60));
  assert.deepEqual(run(60),run(144));
});
test('RB-2: time is monotonic, interruption is explicit',()=>{
  const world=new ActionTimeline();
  world.begin('james','hall',route);
  assert.throws(()=>world.begin('james','hall',route),/Invalid journey/);
  world.advance(20);
  assert.throws(()=>world.advance(19),/Invalid time/);
  world.interrupt('james');
  assert.throws(()=>world.interrupt('james'),/Not moving/);
  world.resume('james');
  assert.throws(()=>world.resume('james'),/Not interrupted/);
});
