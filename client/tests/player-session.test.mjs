import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLivingRoom,PLAYER_CAST} from '../src/living-room.js';

const graph=JSON.parse(await readFile(
  new URL('../src/tower-graph.generated.json',import.meta.url),'utf8'));
const bedroom=graph.research.find(r=>r.year===7&&r.wing==='boys');
const girlRoom=graph.research.find(r=>r.year===7&&r.wing==='girls');

function walkTo(game,waypoints){
  for(const target of waypoints){
    for(let i=0;i<150;i++){
      const current=game.snapshot().player.position;
      const dx=target.x-current.x,dz=target.z-current.z;
      const dist=Math.hypot(dx,dz);
      if(dist<.05)break;
      const step=Math.min(.14,dist);
      const r=game.submit({type:'walk',dx:dx/dist*step,dz:dz/dist*step});
      assert.equal(r.ok,true,'blocked at '+JSON.stringify(current)+' → '+
        JSON.stringify(target)+' ('+r.reason+')');
    }
    const result=game.snapshot().player.position;
    assert.ok(Math.hypot(result.x-target.x,result.z-target.z)<.06);
  }
}

test('G1: one real controlled Marauder; all other NPCs keep their own decisions',()=>{
  for(const actor of PLAYER_CAST){
    const game=createLivingRoom(graph,{playerKey:actor.key});
    const state=game.snapshot();
    assert.equal(state.player.key,actor.key);
    assert.equal(state.player.room,graph.common.key);
    assert.ok(state.player.knownExits.includes(graph.landing.key));
    assert.equal(state.locations.length,actor.key==='peter'?4:3);
    assert.ok(!state.locations.some(([key])=>key===actor.key));
    game.advanceSeconds(600);
    assert.equal(game.snapshot().player.room,graph.common.key);
  }
  assert.throws(()=>createLivingRoom(graph,{playerKey:'lily'}),/playable Marauder/);
});

test('G2: physical approach AND personal discovery gate ECS passage commands',()=>{
  const game=createLivingRoom(graph,{playerKey:'peter'});
  const atStart=game.snapshot().player;
  assert.ok(!atStart.knownRooms.includes(girlRoom.key));
  assert.ok(!atStart.knownRooms.includes(graph.research.find(
    r=>r.year===1&&r.wing==='boys').key));
  assert.equal(game.submit({type:'move',destination:bedroom.key}).reason,'not_in_reach');
  assert.equal(game.submit({type:'survey_wing',wing:'boys'}).reason,'not_in_reach');
  walkTo(game,[{x:0,z:.5},{x:-7.9,z:.5}]);
  const surveyed=game.submit({type:'survey_wing',wing:'boys'});
  assert.equal(surveyed.ok,true);
  assert.ok(surveyed.player.knownRooms.includes(bedroom.key));
  assert.ok(!surveyed.player.knownRooms.includes(girlRoom.key));
  assert.equal(game.submit({type:'survey_wing',wing:'boys'}).reason,'already_explored');
  assert.ok(game.snapshot().player.journal.some(x=>x.includes('таблички')));
  const entry=game.submit({type:'move',destination:bedroom.key});
  assert.equal(entry.ok,true);
  assert.equal(entry.player.room,bedroom.key);
  assert.equal(game.snapshot().locations.length,0,
    'remote NPC occupations are not disclosed in player projection');
  assert.equal(game.submit({type:'move',destination:graph.common.key}).reason,
    'not_in_reach');
  walkTo(game,[{x:0,z:5.52}]);
  assert.equal(game.submit({type:'move',destination:graph.common.key}).ok,true);
  assert.equal(game.snapshot().player.room,graph.common.key);
  walkTo(game,[{x:0,z:12.65}]);
  assert.equal(game.submit({type:'move',destination:graph.landing.key}).ok,true);
  assert.equal(game.snapshot().player.room,graph.landing.key);
  assert.equal(game.submit({type:'move',destination:girlRoom.key}).reason,
    'unknown_destination');
  walkTo(game,[{x:0,z:-6.72}]);
  assert.equal(game.submit({type:'move',destination:graph.common.key}).ok,true);
  assert.ok(game.snapshot().player.position.z>10,
    'Return through the portrait must arrive inside the real vestibule');
});

test('G2: viewing cup and inspecting it require real proximity',()=>{
  const game=createLivingRoom(graph,{playerKey:'peter'});
  const before=game.snapshot().player;
  assert.equal(before.cup.inspected,false);
  assert.equal(before.nearbyCup,false);
  assert.equal(game.submit({type:'inspect_cup'}).reason,'not_in_reach');
  assert.equal(game.submit({type:'break_cup'}).reason,'not_in_reach');
  assert.deepEqual(game.snapshot().player.journal,[]);
  walkTo(game,[{x:0,z:1.5}]);
  assert.equal(game.snapshot().player.nearbyCup,true);
  assert.equal(game.submit({type:'inspect_cup'}).ok,true);
  assert.equal(game.snapshot().player.cup.inspected,true);
  assert.ok(game.snapshot().player.journal.some(x=>x.includes('чашку')));
  assert.equal(game.submit({type:'break_cup'}).ok,true);
  assert.equal(game.snapshot().player.cup.broken,true);
  assert.equal(game.submit({type:'break_cup'}).ok,false);
  walkTo(game,[{x:0,z:12.65}]);
  assert.equal(game.snapshot().player.cup,undefined,
    'distant object state is not known from remote observation');
  assert.equal(game.submit({type:'move',destination:graph.landing.key}).ok,true);
  assert.equal(game.snapshot().player.cup,undefined);
  assert.equal(game.submit({type:'inspect_cup'}).reason,'not_in_reach');
});

test('G2: reject teleport-sized floor moves, spoofing and remote knowledge',()=>{
  const game=createLivingRoom(graph);
  const initial=game.snapshot().player.position;
  for(const request of [
    null,{},false,{type:'cast_spell',actor:99},
    {type:'move',actor:99,destination:bedroom.key},
    {type:'walk',dx:1.2,dz:0},
    {type:'walk',dx:NaN,dz:0},
    {type:'walk',dx:Infinity,dz:0},
    {type:'walk',dx:0,dz:0},
    {type:'survey_wing',wing:'girls'}
  ]){
    const result=game.submit(request);
    assert.equal(result.ok,false,JSON.stringify(request));
  }
  assert.deepEqual(game.snapshot().player.position,initial);
  assert.equal(game.snapshot().player.key,'peter');
  assert.equal(game.submit({type:'move',destination:'unknown-room'}).ok,false);
  assert.ok(game.snapshot().player.knownRooms.length<graph.research.length);
});

test('G1/G2: world advances without moving a manually controlled character',()=>{
  const game=createLivingRoom(graph,{playerKey:'remus',warmupTicks:0});
  const initial=game.snapshot();
  const result=game.advanceSeconds(1200);
  assert.equal(result.snapshot.tick,2);
  assert.equal(game.snapshot().player.room,graph.common.key);
  assert.deepEqual(game.snapshot().player.position,initial.player.position);
  assert.equal(game.snapshot().player.key,'remus');
  assert.ok(game.snapshot().locations.length<=3);
});
