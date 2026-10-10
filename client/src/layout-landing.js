/**
 * [INFERENCE / GAME] west_landing_4 is visually an elevated corridor and
 * stair arrival, NOT a second round Gryffindor common room. Graph ID stays.
 * Flat north/south and side-wall openings preserve physical coherence.
 */
import * as THREE from 'three';
import {LANDING_SLOTS} from './architecture.js';
import {buildOpenings} from './openings.js';
import {onCameraSide} from './wall-geometry.js';
export const LANDING_BOUNDS=Object.freeze({
  minX:-2.90,maxX:2.90,minZ:-4.25,maxZ:4.45
});
export function landingPlan(){
  return {
    width:6.9,length:10.45,
    portrait:{x:0,z:-5.22},
    approach:{x:0,z:-3.14},
    stairArrival:{x:0,z:3.85},
    windows:[{x:-3.45,z:0},{x:3.45,z:0}],
    bounds:{...LANDING_BOUNDS}
  };
}
export function validateLandingPlan(plan){
  if(plan.width<=0||plan.length<=0)
    throw Error('Invalid landing dimensions');
  if(plan.bounds.minZ>=plan.approach.z||
    plan.approach.z>=plan.stairArrival.z||
    plan.stairArrival.z>=plan.bounds.maxZ)
    throw Error('Landing approach disconnected from stair arrival');
  if(Math.abs(plan.portrait.x)>1e-9||
    plan.portrait.z>=plan.bounds.minZ)
    throw Error('Portrait must sit on the far end wall');
  return true;
}
export function buildLandingSpace(group,b){
  const plan=landingPlan();
  validateLandingPlan(plan);
  const S=0x858087,D=0x53515b,G=0xcbaa78,
    F=0x625953,T=0x3d3334,W=0x5b3538;
  b.box(0,-.27,0,plan.width,.54,plan.length,D);
  b.box(0,.01,0,plan.width-.35,.07,plan.length-.35,F);
  // Solid north end wall split around the 2.6m-wide portrait opening.
  for(const side of [-1,1]){
    b.box(side*2.2,1.65,-5.20,2.0,3.3,.44,S);
    b.box(side*2.15,1.65,5.17,2.0,3.3,.45,D);
  }
  // The entrance from the public castle staircase is an open 2.6m arch;
  // it leads outside the current prototype, not an invented ECS room.
  b.box(0,3.13,5.18,2.65,.36,.52,S);
  // The side windows have actual holes rather than glass drawn over stone.
  const cuts=[];
  for(const side of [-1,1]){
    const x=side*3.43;
    for(const span of [
      {z:-3.20,length:3.95},{z:3.19,length:3.97}
    ]) b.box(x,1.60,span.z,.44,3.2,span.length,S);
    b.box(x,.38,0,.5,.76,1.97,D);
    b.box(x,3.07,0,.5,.35,1.97,S);
    // Render near-side wall as a low parapet only when viewed from outside.
    cuts.push({side});
  }
  // Mount the portrait and both window slots onto the EXACT flat boundaries.
  const portrait=buildOpenings(group,5.22,[LANDING_SLOTS[0]]);
  // Both side slots must share same radius 3.45 and must remain oriented
  // along the corridor; the slots themselves know their proper azimuth.
  const windows=buildOpenings(group,3.45,LANDING_SLOTS.slice(1));
  // Ascending stairs of the public castle approach, without a fake new room.
  // Steps begin beyond the clear portrait-to-center walking aisle.
  for(let i=0;i<6;i++){
    const z=2.7+i*.44;
    b.box(0,.08+i*.09,z,2.50,.16,.41,i%2?S:D);
  }
  for(const side of [-1,1]){
    b.box(side*2.55,.41,3.65,.22,.82,2.70,D);
    b.box(side*2.55,.90,3.65,.30,.13,2.74,G);
    b.box(side*2.48,1.45,-3.48,.33,2.9,.34,G);
  }
  // Portrait threshold runs toward a continuous, EMPTY central route.
  b.box(0,.055,-3.9,2.35,.09,1.30,W);
  b.box(0,.055,.15,1.85,.09,4.75,W);
  const lights=[];
  for(const z of [-2.45,1.35]){
    for(const x of [-2.66,2.66]){
      b.box(x,1.45,z,.24,.33,.23,G);
      const flame=new THREE.PointLight(0xffb46e,2.6,5);
      flame.position.set(x,1.8,z);group.add(flame);lights.push(flame);
    }
  }
  // Decor/collision: walls are bounded rectangle; stair railings safely
  // outside walkable interval, path to portrait remains collision-free.
  return {
    bounds:plan.bounds,
    portals:portrait.portals,
    setCameraYaw(yaw){
      portrait.setCameraYaw(yaw);
      windows.setCameraYaw(yaw);
    },
    architecture:LANDING_SLOTS,
    type:'landing'
  };
}
