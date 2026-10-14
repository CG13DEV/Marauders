/**
 * [GAME] G2 — player-local spatial authority for the four-NPC browser slice.
 * A room ID comes from ECS. This bounded adapter owns a *player's* floor
 * position and personally explored architectural labels, not global topology.
 * It must never be confused with full-school physics or a saved world snapshot.
 */
import {STARTS} from './movement.js';
import {LANDING_BOUNDS} from './layout-landing.js';

export const CUP_SPOT=Object.freeze({x:0,z:0});
const ROOT_ROOM=Object.freeze({x:0,z:7.9});
const STAIR_SPOTS=Object.freeze({
  boys:{x:-7.9,z:0},girls:{x:7.9,z:0}
});
const squared=(a,b)=>(a.x-b.x)**2+(a.z-b.z)**2;
export const within=(a,b,radius)=>squared(a,b)<=radius*radius+1e-8;

export function createPlayerSpace({graph,playerHome,walkableCommon}){
  let room=graph.common.key;
  let position={...STARTS.common};
  const knownRooms=new Set([graph.common.key,graph.landing.key,playerHome]);
  const surveyedWings=new Set();
  const visited=new Set([room]);

  const rooms=new Map([graph.common,graph.landing,...graph.research,...graph.legacy]
    .map(r=>[r.key,r]));

  function walkableAt(key,p){
    if(key===graph.common.key)return walkableCommon(p);
    if(key===graph.landing.key)
      return p.x>=LANDING_BOUNDS.minX&&p.x<=LANDING_BOUNDS.maxX&&
        p.z>=LANDING_BOUNDS.minZ&&p.z<=LANDING_BOUNDS.maxZ;
    return Math.hypot(p.x,p.z)<=6.45;
  }
  function walk(dx,dz){
    if(!Number.isFinite(dx)||!Number.isFinite(dz)||
       Math.hypot(dx,dz)>0.55 || (dx===0&&dz===0))
      return {ok:false,reason:'invalid_step'};
    const next={x:position.x+dx,z:position.z+dz};
    // Never tunnel through a thin collider by sending valid-sized steps.
    for(let i=1;i<=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.08));i++){
      const n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.08));
      const sample={x:position.x+dx*i/n,z:position.z+dz*i/n};
      if(!walkableAt(room,sample))return {ok:false,reason:'blocked_path'};
    }
    position=next;
    return {ok:true,position:{...position}};
  }
  function portalFor(destination){
    if(room===graph.common.key){
      if(destination===graph.landing.key)return ROOT_ROOM;
      const target=rooms.get(destination);
      if(target?.wing==='boys')return STAIR_SPOTS.boys;
      if(target?.wing==='girls')return STAIR_SPOTS.girls;
      return null;
    }
    if(destination===graph.common.key)return room===graph.landing.key
      ?{x:0,z:-3.14}:{x:0,z:5.52};
    return null;
  }
  function canCross(destination){
    const portal=portalFor(destination);
    return portal!==null&&within(position,portal,2.45);
  }
  function enter(next){
    if(!rooms.has(next))throw Error('Unknown physical room');
    room=next;visited.add(next);knownRooms.add(next);
    const start=room===graph.common.key?STARTS.common:
      room===graph.landing.key?STARTS.landing:STARTS.bedroom;
    position={...start};
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
  function view(exits){
    return {
      position:{...position},visited:[...visited].sort(),
      knownRooms:[...knownRooms].sort(),
      knownExits:exits.filter(key=>knownRooms.has(key)).sort(),
      surveyedWings:[...surveyedWings].sort(),
      nearbyCup:room===graph.common.key&&within(position,CUP_SPOT,1.85)
    };
  }
  return Object.freeze({
    walk,canCross,enter,survey,view,
    canReachCup:()=>room===graph.common.key&&within(position,CUP_SPOT,1.85),
    knows:key=>knownRooms.has(key),
    current:()=>room
  });
}
