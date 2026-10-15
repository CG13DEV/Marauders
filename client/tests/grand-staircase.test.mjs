import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLivingRoom} from '../src/living-room.js';
import {walkable} from '../src/movement.js';
import {COMMON_PORTRAIT_APPROACH,TOWER_PORTRAIT_APPROACH,
  TOWER_STAIR_APPROACH,grandStairState,isInVestibule,GRAND_STAIR_PERIOD}
  from '../src/tower-entrance.js';
const graph=JSON.parse(await readFile(
  new URL('../src/tower-graph.generated.json',import.meta.url),'utf8'));

function walkTo(game,to){
  for(let i=0;i<190;i++){
    const from=game.snapshot().player.position;
    const delta={x:to.x-from.x,z:to.z-from.z};
    const distance=Math.hypot(delta.x,delta.z);
    if(distance<.06)return;
    const step=Math.min(.14,distance);
    const result=game.submit({type:'walk',dx:delta.x/distance*step,
      dz:delta.z/distance*step});
    assert.equal(result.ok,true,
      'Physically blocked at '+JSON.stringify(from)+': '+result.reason);
  }
  assert.fail('Player could not physically reach '+JSON.stringify(to));
}

test('FILM: the fixed Gryffindor vestibule is part of the existing ECS node',()=>{
  assert.ok(isInVestibule({x:0,z:12.1}));
  assert.ok(isInVestibule({x:0,z:8.4}));
  assert.ok(!isInVestibule({x:2,z:12.1}));
  const fakeStage={radius:10,obstacles:[],walkableExtras:isInVestibule};
  assert.equal(walkable(fakeStage,0,12.1),true);
  assert.equal(walkable(fakeStage,2,12.1),false);
  const game=createLivingRoom(graph,{warmupTicks:0});
  const known=game.snapshot().player.knownRooms.length;
  walkTo(game,COMMON_PORTRAIT_APPROACH);
  assert.equal(game.snapshot().player.room,graph.common.key);
  assert.equal(game.submit({type:'move',destination:graph.landing.key}).ok,true);
  assert.equal(game.snapshot().player.room,graph.landing.key);
  // The reverse portrait threshold is correctly within reach after entry;
  // requiring an artificial walk away and back would break spatial continuity.
  assert.ok(Math.abs(game.snapshot().player.position.z-
    TOWER_PORTRAIT_APPROACH.z)<2.45);
  assert.equal(game.submit({type:'move',destination:graph.common.key}).ok,true);
  assert.equal(game.snapshot().player.position.z,12.1);
  assert.equal(game.snapshot().player.knownRooms.length,known,
    'The vestibule must never become an invented graph room');
});

test('FILM/GAME: staircase rotates on world seconds and never creates a fake edge',()=>{
  assert.equal(grandStairState(0).aligned,true);
  assert.equal(grandStairState(89).aligned,true);
  assert.equal(grandStairState(90).aligned,false);
  assert.equal(grandStairState(120).phase,'balcony');
  assert.equal(grandStairState(180).aligned,false);
  assert.equal(grandStairState(210).aligned,true);
  assert.equal(grandStairState(GRAND_STAIR_PERIOD).angle,0);
  assert.equal(grandStairState(130).secondsToAlign,80);
  assert.equal(graph.gallery.key,'gallery_4');
  assert.ok(graph.links.some(([a,b])=>
    [a,b].includes(graph.gallery.key)&&[a,b].includes(graph.landing.key)));
});

test('GAME: misaligned stairs block ECS travel in BOTH directions',()=>{
  const game=createLivingRoom(graph,{warmupTicks:0});
  walkTo(game,COMMON_PORTRAIT_APPROACH);
  assert.equal(game.submit({type:'move',destination:graph.landing.key}).ok,true);
  walkTo(game,TOWER_STAIR_APPROACH);
  assert.equal(game.submit({type:'survey_gallery'}).ok,true);
  game.advanceSeconds(120);
  assert.equal(game.snapshot().player.grandStair.phase,'balcony');
  assert.equal(game.submit({type:'move',destination:graph.gallery.key}).reason,
    'stair_misaligned');
  game.advanceSeconds(90);
  assert.equal(game.snapshot().player.grandStair.aligned,true);
  assert.equal(game.submit({type:'move',destination:graph.gallery.key}).ok,true);
  assert.equal(game.snapshot().player.room,graph.gallery.key);
  // While the player is inside the gallery, the shared clock still turns.
  game.advanceSeconds(120);
  assert.equal(game.snapshot().player.grandStair.aligned,false);
  assert.equal(game.submit({type:'move',destination:graph.landing.key}).reason,
    'stair_misaligned');
  game.advanceSeconds(120);
  assert.equal(game.snapshot().player.grandStair.aligned,true);
  assert.equal(game.submit({type:'move',destination:graph.landing.key}).ok,true);
  assert.ok(Math.abs(game.snapshot().player.position.z-4.3)<1e-6,
    'The return route must arrive next to the actual rotating flight');
});

test('GAME: staircase changes only on authoritative clock advances',()=>{
  const game=createLivingRoom(graph,{warmupTicks:0});
  walkTo(game,COMMON_PORTRAIT_APPROACH);
  assert.equal(game.submit({type:'move',destination:graph.landing.key}).ok,true);
  const before=game.snapshot().player.grandStair;
  for(let i=0;i<25;i++)game.snapshot();
  assert.deepEqual(game.snapshot().player.grandStair,before);
  game.advanceSeconds(100);
  assert.notEqual(game.snapshot().player.grandStair.angle,before.angle);
  assert.equal(game.snapshot().player.grandStair.aligned,false);
});
