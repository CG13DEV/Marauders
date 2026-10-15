/**
 * [GAME] Player-local 3D physical contact, never an omniscient room list.
 * Two existing ECS staircase landings share one rendered atrium. Walking
 * a moving flight changes x/z/y continuously, but the ECS room changes
 * ONLY at a real, aligned endpoint and passes the normal world command.
 */
import {STARTS} from './movement.js';
import {LANDING_BOUNDS} from './layout-landing.js';
import {COMMON_PORTRAIT_APPROACH,TOWER_PORTRAIT_APPROACH,
  UPPER_LEVEL,STAIR_BASE,STAIR_TOP,STAIR_LENGTH,
  UPPER_GALLERY_PORTAL,LOWER_GALLERY_PORTAL,
  upperWalkable,isInVestibule,grandStairState,stairPoint}
  from './tower-entrance.js';
import {GALLERY_BOUNDS,GALLERY_RETURN,GALLERY_BENCH,
  GALLERY_BENCH_APPROACH} from './layout-gallery.js';

export const CUP_SPOT=Object.freeze({x:0,z:0});
const STAIR_SPOTS=Object.freeze({
  boys:{x:-7.9,z:0},girls:{x:7.9,z:0}
});
const squared=(a,b)=>(a.x-b.x)**2+(a.z-b.z)**2;
export const within=(a,b,radius)=>squared(a,b)<=radius*radius+1e-8;
const bounded=p=>p.x>=LANDING_BOUNDS.minX&&p.x<=LANDING_BOUNDS.maxX&&
  p.z>=LANDING_BOUNDS.minZ&&p.z<=LANDING_BOUNDS.maxZ&&
  [-7.4,7.4].every(x=>[-7.4,7.4].every(z=>
    !within(p,{x,z},.74)));

export function createPlayerSpace({graph,playerHome,walkableCommon,
  nowSeconds=()=>0}){
  let room=graph.common.key;
  let position={...STARTS.common};
  let flightProgress=null;
  const knownRooms=new Set([graph.common.key,graph.landing.key,playerHome]);
  const surveyedWings=new Set();
  const visited=new Set([room]);
  const rooms=new Map([graph.common,graph.landing,graph.gallery,
    graph.lowerLanding,graph.lowerGallery,...graph.research,...graph.legacy]
    .filter(Boolean).map(r=>[r.key,r]));
  const upperRoom=()=>room===graph.landing.key;
  const lowerRoom=()=>room===graph.lowerLanding?.key;
  const inTower=()=>upperRoom()||lowerRoom();
  function elevation(){
    if(flightProgress!==null)return flightProgress*UPPER_LEVEL;
    return upperRoom()?UPPER_LEVEL:0;
  }
  function currentPoint(){
    return flightProgress===null?{...position}:
      stairPoint(flightProgress,nowSeconds());
  }
  function walkableAt(key,p){
    if(key===graph.common.key)return walkableCommon(p)||isInVestibule(p);
    if(key===graph.landing.key)return upperWalkable(p);
    if(key===graph.lowerLanding?.key)return bounded(p);
    if(key===graph.gallery.key||key===graph.lowerGallery?.key)
      return p.x>=GALLERY_BOUNDS.minX&&p.x<=GALLERY_BOUNDS.maxX&&
        p.z>=GALLERY_BOUNDS.minZ&&p.z<=GALLERY_BOUNDS.maxZ&&
        !within(p,GALLERY_BENCH,GALLERY_BENCH.r+.30);
    return Math.hypot(p.x,p.z)<=6.45;
  }
  function walk(dx,dz){
    if(!Number.isFinite(dx)||!Number.isFinite(dz)||
       Math.hypot(dx,dz)>0.55||(dx===0&&dz===0))
      return {ok:false,reason:'invalid_step'};
    if(flightProgress!==null){
      const state=grandStairState(nowSeconds());
      const longitudinal=dx*Math.sin(state.angle)+dz*Math.cos(state.angle);
      const cross=dx*Math.cos(state.angle)-dz*Math.sin(state.angle);
      // No dropping off the side. The same flight orientation drives mesh,
      // contact and input projection. No client-only "rise" button.
      if(Math.abs(cross)>Math.abs(longitudinal)*1.5)
        return {ok:false,reason:'stair_rail'};
      const next=Math.max(0,Math.min(1,
        flightProgress+longitudinal/STAIR_LENGTH));
      if(Math.abs(next-flightProgress)<1e-8)
        return {ok:false,reason:'stair_endpoint'};
      flightProgress=next;
      const atEnd=next<=1e-8||next>=1-1e-8;
      return {ok:true,position:currentPoint(),
        ...(atEnd&&state.aligned?{transition:next===0
          ?graph.lowerLanding.key:graph.landing.key}:{})};
    }
    const next={x:position.x+dx,z:position.z+dz};
    const n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.08));
    for(let i=1;i<=n;i++){
      const sample={x:position.x+dx*i/n,z:position.z+dz*i/n};
      if(!walkableAt(room,sample))return {ok:false,reason:'blocked_path'};
    }
    position=next;
    return {ok:true,position:{...position,y:elevation()}};
  }
  function mountStair(){
    if(flightProgress!==null)return {ok:false,reason:'already_on_stairs'};
    if(!inTower())return {ok:false,reason:'not_in_tower'};
    const state=grandStairState(nowSeconds());
    const endpoint=upperRoom()?STAIR_TOP:STAIR_BASE;
    if(!within(position,endpoint,.87))
      return {ok:false,reason:'not_in_reach'};
    // Upper balcony does NOT extend to the rotating end while detached.
    if(upperRoom()&&!state.aligned)
      return {ok:false,reason:'stair_misaligned'};
    flightProgress=upperRoom()?1:0;
    knownRooms.add(graph.lowerLanding.key);
    knownRooms.add(graph.landing.key);
    return {ok:true,position:currentPoint()};
  }
  function portalFor(destination){
    if(upperRoom()){
      if(destination===graph.common.key)return TOWER_PORTRAIT_APPROACH;
      if(destination===graph.gallery.key)return UPPER_GALLERY_PORTAL;
    }
    if(lowerRoom()&&destination===graph.lowerGallery.key)
      return LOWER_GALLERY_PORTAL;
    if(room===graph.gallery.key&&destination===graph.landing.key)
      return GALLERY_RETURN;
    if(room===graph.lowerGallery?.key&&
       destination===graph.lowerLanding.key)return GALLERY_RETURN;
    if(room===graph.common.key){
      if(destination===graph.landing.key)return COMMON_PORTRAIT_APPROACH;
      const target=rooms.get(destination);
      if(target?.wing==='boys')return STAIR_SPOTS.boys;
      if(target?.wing==='girls')return STAIR_SPOTS.girls;
    }
    if(destination===graph.common.key)return {x:0,z:5.52};
    return null;
  }
  function atPortal(destination){
    if(flightProgress!==null)return false;
    const portal=portalFor(destination);
    return portal!==null&&within(position,portal,2.25);
  }
  function canCross(destination){return atPortal(destination);}
  function enter(next){
    if(!rooms.has(next))throw Error('Unknown physical room');
    const previous=room;
    room=next;visited.add(next);knownRooms.add(next);
    flightProgress=null;
    position=room===graph.common.key
      ?previous===graph.landing.key?{x:0,z:12.10}:{...STARTS.common}
      :room===graph.landing.key
        ?previous===graph.lowerLanding.key?{...STAIR_TOP}
          :previous===graph.gallery.key?{...UPPER_GALLERY_PORTAL}
          :{...STARTS.landing}
        :room===graph.lowerLanding.key
          ?previous===graph.landing.key?{...STAIR_BASE}
            :{...LOWER_GALLERY_PORTAL}
        :room===graph.gallery.key||room===graph.lowerGallery?.key
          ?{...STARTS.gallery}:{...STARTS.bedroom};
  }
  function survey(wing){
    if(room!==graph.common.key||!(wing in STAIR_SPOTS)||
       !within(position,STAIR_SPOTS[wing],2.45))
      return {ok:false,reason:'not_in_reach'};
    if(surveyedWings.has(wing))return {ok:false,reason:'already_explored'};
    surveyedWings.add(wing);
    const roomsSeen=[...graph.research,...graph.legacy]
      .filter(r=>r.wing===wing).map(r=>r.key);
    for(const key of roomsSeen)knownRooms.add(key);
    return {ok:true,roomsSeen};
  }
  function surveyGallery(){
    const target=upperRoom()?graph.gallery:
      lowerRoom()?graph.lowerGallery:null;
    const portal=target&&portalFor(target.key);
    if(!target||!portal||!within(position,portal,2.25)||
      flightProgress!==null)return {ok:false,reason:'not_in_reach'};
    if(knownRooms.has(target.key))
      return {ok:false,reason:'already_explored'};
    knownRooms.add(target.key);
    return {ok:true,room:target.key};
  }
  function view(exits){
    const pos=currentPoint();
    return {
      position:{x:pos.x,z:pos.z},elevation:pos.y??elevation(),
      onStairs:flightProgress!==null,
      stairProgress:flightProgress,
      visited:[...visited].sort(),
      knownRooms:[...knownRooms].sort(),
      knownExits:exits.filter(key=>knownRooms.has(key)).sort(),
      surveyedWings:[...surveyedWings].sort(),
      nearbyCup:room===graph.common.key&&within(position,CUP_SPOT,1.85),
      ...(inTower()||room===graph.gallery.key||
        room===graph.lowerGallery?.key
        ?{grandStair:grandStairState(nowSeconds())}:{})
    };
  }
  return Object.freeze({
    walk,mountStair,canCross,atPortal,enter,survey,surveyGallery,view,
    canReachCup:()=>room===graph.common.key&&within(position,CUP_SPOT,1.85),
    canUseGalleryBench:()=>room===graph.gallery.key&&
      within(position,GALLERY_BENCH_APPROACH,1.10),
    knows:key=>knownRooms.has(key),
    current:()=>room
  });
}
