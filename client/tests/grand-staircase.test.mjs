import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLivingRoom} from '../src/living-room.js';
import {walkable} from '../src/movement.js';
import {COMMON_PORTRAIT_APPROACH,TOWER_PORTRAIT_APPROACH,
  STAIR_BASE,STAIR_TOP,UPPER_LEVEL,UPPER_GALLERY_PORTAL,
  LOWER_GALLERY_PORTAL,stairPoint,upperWalkable,
  grandStairState,isInVestibule,GRAND_STAIR_PERIOD}
  from '../src/tower-entrance.js';
const graph=JSON.parse(await readFile(
  new URL('../src/tower-graph.generated.json',import.meta.url),'utf8'));

function walkTo(game,to){
  for(let i=0;i<200;i++){
    const from=game.snapshot().player.position;
    const delta={x:to.x-from.x,z:to.z-from.z};
    const dist=Math.hypot(delta.x,delta.z);
    if(dist<.055)return;
    const step=Math.min(.14,dist);
    const result=game.submit({type:'walk',dx:delta.x/dist*step,
      dz:delta.z/dist*step});
    assert.equal(result.ok,true,
      'Blocked '+JSON.stringify(from)+' → '+JSON.stringify(to)+': '+result.reason);
  }
  assert.fail('Route not reached: '+JSON.stringify(to));
}
function upperEntry(game){
  walkTo(game,COMMON_PORTRAIT_APPROACH);
  assert.equal(game.submit({type:'move',destination:graph.landing.key}).ok,true);
  assert.equal(game.snapshot().player.elevation,UPPER_LEVEL);
}
function reachUpperStair(game){
  walkTo(game,{x:0,z:-6.5});
  walkTo(game,{x:STAIR_TOP.x,z:-6.5});
  walkTo(game,STAIR_TOP);
}
function moveOnFlight(game,sign){
  for(let i=0;i<45;i++){
    const state=game.snapshot().player;
    if(!state.onStairs)return;
    const a=state.grandStair.angle;
    const delta={dx:Math.sin(a)*.14*sign,dz:Math.cos(a)*.14*sign};
    const outcome=game.submit({type:'walk',...delta});
    assert.equal(outcome.ok,true,'stair movement blocked: '+outcome.reason);
    if(outcome.transition)return;
  }
}

test('CANON/FILM: portrait is UPSTAIRS, tunnel stays same ECS common room',()=>{
  assert.ok(isInVestibule({x:0,z:12.1}));
  assert.ok(!isInVestibule({x:2,z:12.1}));
  assert.ok(upperWalkable({x:0,z:-6.5}));
  assert.ok(upperWalkable(STAIR_TOP));
  assert.ok(!upperWalkable({x:0,z:0}),
    'There is no invisible full-height floating central floor');
  const stage={radius:10,obstacles:[],walkableExtras:isInVestibule};
  assert.equal(walkable(stage,0,12.1),true);
  const game=createLivingRoom(graph,{warmupTicks:0});
  const known=game.snapshot().player.knownRooms.length;
  upperEntry(game);
  assert.equal(game.snapshot().player.position.z,TOWER_PORTRAIT_APPROACH.z);
  assert.equal(game.snapshot().player.elevation,UPPER_LEVEL);
  assert.equal(game.submit({type:'move',destination:graph.common.key}).ok,true);
  assert.equal(game.snapshot().player.position.z,12.1);
  assert.equal(game.snapshot().player.knownRooms.length,known);
});

test('GAME: the existing ECS really has two adjacent landings and galleries',()=>{
  assert.equal(graph.lowerLanding.key,'west_landing_3');
  assert.equal(graph.lowerGallery.key,'gallery_3');
  for(const [from,to] of [
    [graph.landing.key,graph.lowerLanding.key],
    [graph.landing.key,graph.gallery.key],
    [graph.lowerLanding.key,graph.lowerGallery.key]
  ])assert.ok(graph.links.some(([a,b])=>
    (a===from&&b===to)||(b===from&&a===to)),
    'Missing authority graph edge '+from+' → '+to);
});

test('GAME: no room changes until character physically walks DOWN the risers',()=>{
  const game=createLivingRoom(graph,{warmupTicks:0});
  upperEntry(game);
  assert.equal(game.submit({type:'move',destination:graph.lowerLanding.key}).reason,
    'unknown_destination');
  reachUpperStair(game);
  const mounted=game.submit({type:'mount_stair'});
  assert.equal(mounted.ok,true);
  assert.equal(mounted.player.onStairs,true);
  assert.equal(mounted.player.stairProgress,1);
  assert.equal(game.submit({type:'move',destination:graph.lowerLanding.key}).reason,
    'not_in_reach','Cannot cross graph edge before walking down');
  const result=game.submit({type:'walk',dx:0,dz:-.14});
  assert.equal(result.ok,true);
  assert.equal(game.snapshot().player.room,graph.landing.key,
    'A middle tread is still on the upper landing ECS room');
  assert.ok(result.player.elevation>0&&result.player.elevation<UPPER_LEVEL);
  moveOnFlight(game,-1);
  assert.equal(game.snapshot().player.room,graph.lowerLanding.key);
  assert.equal(game.snapshot().player.onStairs,false);
  assert.equal(game.snapshot().player.elevation,0);
  walkTo(game,LOWER_GALLERY_PORTAL);
  assert.equal(game.submit({type:'survey_gallery'}).ok,true);
  assert.equal(game.submit({type:'move',destination:graph.lowerGallery.key}).ok,true);
  assert.equal(game.snapshot().player.room,graph.lowerGallery.key);
  assert.equal(game.submit({type:'move',destination:graph.lowerLanding.key}).ok,true);
});

test('GAME: lower gallery, moving flight, upper gallery all connect',()=>{
  const game=createLivingRoom(graph,{warmupTicks:0});
  upperEntry(game);
  reachUpperStair(game);
  assert.equal(game.submit({type:'mount_stair'}).ok,true);
  moveOnFlight(game,-1);
  assert.equal(game.snapshot().player.room,graph.lowerLanding.key);
  assert.equal(game.submit({type:'mount_stair'}).ok,true);
  moveOnFlight(game,1);
  assert.equal(game.snapshot().player.room,graph.landing.key);
  walkTo(game,{x:STAIR_TOP.x,z:-6.5});
  walkTo(game,{x:0,z:-6.5});
  walkTo(game,UPPER_GALLERY_PORTAL);
  assert.equal(game.submit({type:'survey_gallery'}).ok,true);
  assert.equal(game.submit({type:'move',destination:graph.gallery.key}).ok,true);
  assert.equal(game.snapshot().player.room,graph.gallery.key);
});

test('GAME: passenger turns WITH flight; disconnected top cannot be exited',()=>{
  const game=createLivingRoom(graph,{warmupTicks:0});
  upperEntry(game);
  reachUpperStair(game);
  assert.equal(game.submit({type:'mount_stair'}).ok,true);
  game.submit({type:'walk',dx:0,dz:-2*.14});
  for(let i=0;i<10;i++)game.submit({type:'walk',dx:0,dz:-.14});
  const before=game.snapshot().player;
  assert.ok(before.onStairs&&before.elevation>0);
  game.advanceSeconds(120);
  const after=game.snapshot().player;
  assert.ok(after.onStairs);
  assert.equal(after.elevation,before.elevation);
  assert.notEqual(after.position.x,before.position.x);
  assert.equal(after.grandStair.phase,'other_direction');
  const pos=stairPoint(after.stairProgress,game.snapshot().worldSeconds);
  assert.ok(Math.abs(after.position.x-pos.x)<1e-9);
  assert.ok(Math.abs(after.position.z-pos.z)<1e-9);
  // A rider may walk along the rotated physical stair, but cannot walk
  // through the upper connection until the actual platform realigns.
  moveOnFlight(game,1);
  assert.equal(game.snapshot().player.onStairs,true);
  assert.equal(game.snapshot().player.room,graph.landing.key);
  game.advanceSeconds(90);
  assert.equal(game.snapshot().player.grandStair.aligned,true);
  assert.equal(game.submit({type:'walk',dx:0,dz:.14}).ok,true);
});

test('GAME: rotation uses ECS world seconds rather than render polling',()=>{
  assert.equal(grandStairState(89).aligned,true);
  assert.equal(grandStairState(90).aligned,false);
  assert.equal(grandStairState(120).phase,'other_direction');
  assert.equal(grandStairState(210).aligned,true);
  assert.equal(grandStairState(GRAND_STAIR_PERIOD).angle,0);
  const game=createLivingRoom(graph,{warmupTicks:0});
  upperEntry(game);
  const before=game.snapshot().player.grandStair;
  for(let i=0;i<25;i++)game.snapshot();
  assert.deepEqual(game.snapshot().player.grandStair,before);
  game.advanceSeconds(100);
  assert.notEqual(game.snapshot().player.grandStair.angle,before.angle);
  assert.equal(game.snapshot().player.grandStair.aligned,false);
});
