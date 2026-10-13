import test from 'node:test';
import assert from 'node:assert/strict';
import {TimedWorldBridge} from '../src/core/timed-world-bridge.ts';
import {createSimulation, type CommandResult} from '../src/core/Simulation.ts';

test('RB-3: only validated timed arrival mutates authoritative room',()=>{
  const rooms=new Map([[7,1]]);
  const bridge=new TimedWorldBridge(actor=>rooms.get(actor)??null,command=>{
    assert.equal(command.type,'move');
    if(command.type!=='move')throw Error('not a move');
    const from=rooms.get(command.actor)!;
    rooms.set(command.actor,command.destination);
    return {ok:true,events:[{type:'entity_moved',actor:command.actor,from,to:command.destination}]};
  });
  bridge.begin(7,3,[{from:1,to:2,seconds:120},{from:2,to:3,seconds:120}]);
  bridge.advance(60);
  assert.equal(rooms.get(7),1);
  bridge.interrupt(7);
  bridge.advance(300);
  assert.equal(rooms.get(7),1);
  assert.equal(bridge.observe(7)?.progress,0.5);
  bridge.resume(7);
  bridge.advance(360);
  assert.equal(rooms.get(7),2);
  bridge.advance(480);
  assert.equal(rooms.get(7),3);
  bridge.advance(600);
  assert.deepEqual(bridge.events().map(e=>[e.at,e.from,e.to]),[[360,1,2],[480,2,3]]);
});
test('RB-3: rejected world command does not mutate authoritative room',()=>{
  const bridge=new TimedWorldBridge(()=>1,():CommandResult=>({
    ok:false,reason:'unknown_passage',events:[]
  }));
  bridge.begin(7,2,[{from:1,to:2,seconds:10}]);
  bridge.advance(10);
  assert.equal(bridge.events()[0]?.result.ok,false);
});

test('RB-3.1: a large time jump commits each leg before the next one',()=>{
  const rooms=new Map([[7,1]]);
  const bridge=new TimedWorldBridge(actor=>rooms.get(actor)??null,command=>{
    if(command.type!=='move')throw Error('not a move');
    const from=rooms.get(command.actor)!;
    rooms.set(command.actor,command.destination);
    return {ok:true,events:[{type:'entity_moved',actor:command.actor,from,to:command.destination}]};
  });
  bridge.begin(7,3,[{from:1,to:2,seconds:10},{from:2,to:3,seconds:10}]);
  bridge.advance(100);
  assert.equal(rooms.get(7),3);
  assert.deepEqual(bridge.events().map(e=>[e.at,e.result.ok]),[[10,true],[20,true]]);
});

test('RB-3.1: rejected first leg cancels all future arrivals',()=>{
  let attempts=0;
  const bridge=new TimedWorldBridge(()=>1,():CommandResult=>{
    attempts++;
    return {ok:false,reason:'unknown_passage',events:[]};
  });
  bridge.begin(7,3,[{from:1,to:2,seconds:10},{from:2,to:3,seconds:10}]);
  bridge.advance(100);
  assert.equal(attempts,1);
  assert.equal(bridge.observe(7),null);
  assert.deepEqual(bridge.events().map(e=>e.at),[10]);
  assert.equal(bridge.clock.events().filter(e=>e.kind==='arrive').length,1);
});

test('RB-3.2: real simulation commits timed movement to ECS and world journal',()=>{
  const world=createSimulation();
  const tower=world.room('rb3-tower','Tower');
  const stairs=world.room('rb3-stairs','Stairs');
  const hall=world.room('rb3-hall','Hall');
  world.connect(tower,stairs);
  world.connect(stairs,hall);
  const james=world.character('rb3-james','James',tower);
  const bridge=world.createTimedMovement();
  bridge.begin(james,hall,[{from:tower,to:stairs,seconds:60},{from:stairs,to:hall,seconds:60}]);
  bridge.advance(59);
  assert.equal(world.currentRoom(james),tower);
  assert.deepEqual(world.occupants(stairs),[]);
  bridge.advance(120);
  assert.equal(world.currentRoom(james),hall);
  assert.deepEqual(world.occupants(hall),[james]);
  assert.deepEqual(world.events().filter(e=>e.type==='entity_moved').map(e=>e.to),[stairs,hall]);
  assert.deepEqual(bridge.events().map(e=>e.at),[60,120]);
});

test('RB-3.3c: owning clock sees each arrival time before world execution',()=>{
  const observed:number[]=[];
  let time=0;
  const rooms=new Map([[7,1]]);
  const bridge=new TimedWorldBridge(actor=>rooms.get(actor)??null,command=>{
    if(command.type!=='move')throw Error('not a move');
    observed.push(time);
    rooms.set(command.actor,command.destination);
    return {ok:true,events:[]};
  },seconds=>{time=seconds;});
  bridge.begin(7,3,[{from:1,to:2,seconds:10},{from:2,to:3,seconds:20}]);
  bridge.advance(100);
  assert.deepEqual(observed,[10,30]);
  assert.equal(time,100);
});

test('RB-3.3c: Simulation owns bridge time and legacy school steps',()=>{
  const world=createSimulation();
  const a=world.room('rb33-a','A');
  const b=world.room('rb33-b','B');
  world.connect(a,b);
  const james=world.character('rb33-james','James',a);
  const bridge=world.createTimedMovement();
  assert.equal(world.createTimedMovement(),bridge);
  bridge.begin(james,b,[{from:a,to:b,seconds:60}]);
  world.step();
  assert.equal(world.currentRoom(james),b);
  assert.equal(world.worldSeconds(),600);
  assert.equal(world.tick(),1);
  assert.equal(world.clock().absoluteMinute,490);
  assert.equal(bridge.events()[0]?.at,60);
  world.step();
  assert.equal(world.worldSeconds(),1200);
  assert.equal(world.tick(),2);
});
