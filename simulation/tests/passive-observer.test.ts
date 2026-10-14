import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/Simulation.ts';
import {PassiveRoomObserver,roomDelta,roomSnapshot} from '../src/core/passive-observer.ts';

function fixture(){
  const world=createSimulation();
  const a=world.room('a','Спальня');
  const b=world.room('b','Гостиная');
  const c=world.room('c','Коридор');
  world.connect(a,b);world.connect(b,c);
  const james=world.character('james','Джеймс',a);
  const sirius=world.character('sirius','Сириус',b);
  world.setManualControl(james,true);
  world.setManualControl(sirius,true);
  return {world,a,b,c,james,sirius};
}
const actors=['james','sirius'],rooms=['a','b','c'];

test('RB-1: observer reconstructs successive validated moves without reading ECS',()=>{
  const {world,b,c,james}=fixture();
  const observer=new PassiveRoomObserver(roomSnapshot(world,actors,rooms));
  let cursor=world.events().length;
  for(const [destination,sequence] of [[b,1],[c,2]] as const){
    assert.equal(world.execute({type:'move',actor:james,destination}).ok,true);
    const events=world.events();
    observer.apply(roomDelta(world,events.slice(cursor),actors,rooms,sequence));
    cursor=events.length;
  }
  assert.equal(observer.roomOf('james'),'c');
  assert.deepEqual(observer.state(),roomSnapshot(world,actors,rooms).locations
    .slice().sort(([a],[b])=>a.localeCompare(b)));
});

test('RB-1: two observers can join at different times and converge',()=>{
  const {world,b,c,james}=fixture();
  const early=new PassiveRoomObserver(roomSnapshot(world,actors,rooms));
  world.execute({type:'move',actor:james,destination:b});
  early.apply(roomDelta(world,world.events(),actors,rooms,1));
  const late=new PassiveRoomObserver(roomSnapshot(world,actors,rooms,1));
  const cursor=world.events().length;
  world.execute({type:'move',actor:james,destination:c});
  const delta=roomDelta(world,world.events().slice(cursor),actors,rooms,2);
  early.apply(delta);late.apply(delta);
  assert.deepEqual(early.state(),late.state());
});

test('RB-1: rejects missing, duplicated, and contradictory events atomically',()=>{
  const {world}=fixture();
  const observer=new PassiveRoomObserver(roomSnapshot(world,actors,rooms));
  const original=observer.state();
  assert.throws(()=>observer.apply({version:1,sequence:2,tick:0,movements:[]}),/sequence/);
  assert.throws(()=>observer.apply({version:1,sequence:1,tick:0,
    movements:[{actor:'james',from:'c',to:'b'}]}),/continuity/);
  assert.deepEqual(observer.state(),original);
  observer.apply({version:1,sequence:1,tick:0,movements:[]});
  assert.throws(()=>observer.apply({version:1,sequence:1,tick:0,movements:[]}),/sequence/);
});

test('RB-1: observer is passive and reveals no private memories',()=>{
  const {world,b,james}=fixture();
  const before=world.captureRuntime();
  const snapshot=roomSnapshot(world,actors,rooms);
  const observer=new PassiveRoomObserver(snapshot);
  assert.equal(JSON.stringify(world.captureRuntime()),JSON.stringify(before));
  assert.equal(JSON.stringify(snapshot).includes('beliefs'),false);
  assert.equal(JSON.stringify(snapshot).includes('observations'),false);
  world.execute({type:'move',actor:james,destination:b});
  observer.apply(roomDelta(world,world.events(),actors,rooms,1));
  assert.equal(world.currentRoom(james),b);
});
