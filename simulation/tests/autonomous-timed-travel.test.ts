import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/Simulation.ts';

function fixture({timed=true,door=false}={}){
  const world=createSimulation();
  const common=world.room('rb51-common','Common room');
  const dining=world.room('rb51-dining','Dining room');
  world.connect(common,dining,{travelMinutes:2,
    ...(door?{door:{key:'rb51-door',label:'Passage door',open:false}}:{})});
  const james=world.character('rb51-james','James',common);
  world.setDailyLife(james,{homeRoom:common,diningRoom:dining,
    style:'outgoing',interest:'castle'});
  if(timed)world.setAutonomousTimedTravel(james,true);
  return {world,common,dining,james};
}

test('RB-5.1: autonomous scheduler schedules move; ECS commits only on authoritative arrival',()=>{
  const {world,common,dining,james}=fixture();
  const decisions=world.step();
  assert.equal(world.tick(),1);
  const accepted=decisions.find(d=>d.actor===james&&d.action.type==='move');
  assert.ok(accepted,'daily-life NPC must independently decide to travel to breakfast');
  assert.equal(accepted.result.ok,true);
  assert.equal(accepted.result.ok&&accepted.result.scheduled,true);
  assert.deepEqual(accepted.result.events,[]);
  assert.equal(world.currentRoom(james),common,'no instantaneous room mutation');
  assert.equal(world.events().filter(e=>e.type==='entity_moved').length,0);
  assert.deepEqual(world.timedTravelOf(james),{
    from:common,to:dining,goal:dining,progress:0,remainingSeconds:120,paused:false
  });
  // Sampling is observational; advancing the authoritative clock is explicit.
  for(let i=0;i<30;i++)world.timedTravelOf(james);
  assert.equal(world.worldSeconds(),600);
  const bridge=world.createTimedMovement();
  bridge.advance(660);
  assert.equal(world.currentRoom(james),common);
  assert.equal(world.timedTravelOf(james)?.progress,0.5);
  assert.equal(world.execute({type:'move',actor:james,destination:dining}).ok,false);
  bridge.advance(719);
  assert.equal(world.currentRoom(james),common);
  bridge.advance(720);
  assert.equal(world.currentRoom(james),dining);
  assert.equal(world.timedTravelOf(james),null);
  assert.deepEqual(world.events().filter(e=>e.type==='entity_moved').map(e=>e.to),[dining]);
  assert.deepEqual(bridge.events().map(e=>[e.at,e.result.ok]),[[720,true]]);
});

test('RB-5.1: autonomous transit pauses and resumes without teleporting or losing time',()=>{
  const {world,common,dining,james}=fixture();
  world.step();
  const bridge=world.createTimedMovement();
  bridge.advance(660);
  bridge.interrupt(james);
  bridge.advance(840);
  assert.equal(world.currentRoom(james),common);
  assert.equal(world.timedTravelOf(james)?.progress,0.5);
  assert.equal(world.timedTravelOf(james)?.paused,true);
  bridge.resume(james);
  bridge.advance(899);
  assert.equal(world.currentRoom(james),common);
  bridge.advance(900);
  assert.equal(world.currentRoom(james),dining);
  assert.deepEqual(bridge.events().map(e=>e.at),[900]);
});

test('RB-5.1: closed passages open through normal scheduler before travel',()=>{
  const {world,common,dining,james}=fixture({door:true});
  const first=world.step();
  assert.ok(first.some(d=>d.action.type==='open_door'&&d.result.ok));
  assert.equal(world.currentRoom(james),common);
  assert.equal(world.timedTravelOf(james),null);
  const second=world.step();
  assert.ok(second.some(d=>d.action.type==='move'&&d.result.ok&&d.result.scheduled));
  assert.equal(world.currentRoom(james),common);
  world.createTimedMovement().advance(1320);
  assert.equal(world.currentRoom(james),dining);
});

test('RB-5.1: existing scheduler behaviour remains immediate unless explicitly opted in',()=>{
  const {world,dining,james}=fixture({timed:false});
  const decisions=world.step();
  assert.ok(decisions.some(d=>d.actor===james&&d.action.type==='move'&&d.result.ok));
  assert.equal(world.currentRoom(james),dining);
  assert.equal(world.timedTravelOf(james),null);
});

test('RB-5.1: incomplete journeys cannot be saved silently; old bridge is retired on restore',()=>{
  const {world,common,dining,james}=fixture();
  const initial=world.captureRuntime();
  world.step();
  assert.throws(()=>world.captureRuntime(),/checkpoint boundary/);
  const bridge=world.createTimedMovement();
  bridge.advance(720);
  assert.equal(world.currentRoom(james),dining);
  assert.throws(()=>world.captureRuntime(),/checkpoint boundary/);
  world.step();
  assert.equal(world.tick(),2);
  assert.equal(world.worldSeconds(),1200);
  assert.ok(world.captureRuntime().locations.some(([id,room])=>id===james&&room===dining));
  world.hydrateRuntime(initial);
  assert.equal(world.currentRoom(james),common);
  assert.equal(world.worldSeconds(),0);
  assert.throws(()=>bridge.advance(1300),/invalidated/);
  // The opt-in policy is world configuration, not a private NPC memory.
  const after=world.step();
  assert.ok(after.some(d=>d.actor===james&&d.action.type==='move'&&
    d.result.ok&&d.result.scheduled));
});

test('RB-5.1: scheduler cannot change mode mid-route',()=>{
  const {world,james}=fixture();
  world.step();
  assert.throws(()=>world.setAutonomousTimedTravel(james,false),/while moving/);
  assert.throws(()=>world.setAutonomousTimedTravel(999,true),/requires a character/);
});
