import test from 'node:test';
import assert from 'node:assert/strict';
import {TimedWorldBridge} from '../src/core/timed-world-bridge.ts';
import type {CommandResult} from '../src/core/Simulation.ts';

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
