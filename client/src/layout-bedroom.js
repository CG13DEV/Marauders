/**
 * [GAME] Spatial grammar of a Gryffindor dormitory. Five capacity SLOTS are
 * stable even when fewer residents occupy them. Empty places remain empty
 * floor rather than invisible sixth beds or furniture obstructing circulation.
 * No simulation data is changed; occupancy arrives from the build-time graph.
 */
import {roomAnchor,signedAngle} from './architecture.js';

export const DORM_BED_ANGLES=Object.freeze([
  -2.04,-1.34,Math.PI,1.34,2.04
]);
const BED_RADIUS=5.48;
const BED_LENGTH=2.18;
const BED_WIDTH=1.55;
export function bedroomPlan({radius=7.6,students=5,capacity=5}={}){
  if(capacity!==5||!Number.isInteger(students)||
    students<0||students>capacity)
    throw Error('Dorm occupancy must be 0..5 (capacity is 5)');
  if(radius<7.2)throw Error('Dorm radius too small for five canopies');
  const slots=DORM_BED_ANGLES.map((angle,index)=>{
    const center=roomAnchor(BED_RADIUS,angle);
    const trunk=roomAnchor(BED_RADIUS-1.78,angle);
    return {
      index,angle,rotation:angle+Math.PI,
      center,head:roomAnchor(BED_RADIUS+BED_LENGTH/2,angle),
      foot:roomAnchor(BED_RADIUS-BED_LENGTH/2,angle),
      trunk,
      occupied:index<students,
      width:BED_WIDTH,length:BED_LENGTH
    };
  });
  return Object.freeze({
    radius,capacity,students,centerClearance:2.8,
    beds:slots,
    desk:{x:-2.9,z:3.65,angle:-.25},
    readingChair:{x:-3.0,z:2.6},
    rug:{x:0,z:0,radius:2.25},
    windowBenches:[
      {...roomAnchor(radius-1.72,-2.5),angle:-2.5},
      {...roomAnchor(radius-1.72,2.5),angle:2.5}
    ]
  });
}
export function bedOverlap(a,b,margin=.18){
  // Oriented rectangle collision via separating-axis theorem (XZ plane).
  const vertices=bed=>{
    const rad={x:Math.sin(bed.angle),z:Math.cos(bed.angle)};
    const tangent={x:Math.cos(bed.angle),z:-Math.sin(bed.angle)};
    return [-1,1].flatMap(length=>
      [-1,1].map(width=>({
        x:bed.center.x+rad.x*length*(bed.length/2+margin/2)+
          tangent.x*width*(bed.width/2+margin/2),
        z:bed.center.z+rad.z*length*(bed.length/2+margin/2)+
          tangent.z*width*(bed.width/2+margin/2)
      })));
  };
  const aV=vertices(a),bV=vertices(b);
  for(const angle of [a.angle,a.angle+Math.PI/2,
    b.angle,b.angle+Math.PI/2]){
    const axis={x:Math.sin(angle),z:Math.cos(angle)};
    const project=points=>points.map(p=>p.x*axis.x+p.z*axis.z);
    const ap=project(aV),bp=project(bV);
    if(Math.max(...ap)<Math.min(...bp)||
      Math.max(...bp)<Math.min(...ap))return false;
  }
  return true;
}
export function validateBedroomPlan(plan,windowAngles=[-2.5,2.5]){
  const bedRadius=Math.hypot(plan.beds[0].center.x,plan.beds[0].center.z);
  for(const bed of plan.beds){
    if(Math.hypot(bed.center.x,bed.center.z)-bed.length/2<
      plan.centerClearance+.25)
      throw Error('Bed blocks free central passage');
    if(bedRadius+bed.length/2+1>plan.radius)
      throw Error('Headboard intersects masonry shell');
    if(Math.abs(signedAngle(bed.angle,0))<.35)
      throw Error('Bed blocks dormitory exit');
    for(const angle of windowAngles)
      if(Math.abs(signedAngle(bed.angle,angle))<.32)
        throw Error('Bed blocks window embrasure');
  }
  for(let i=0;i<plan.beds.length;i++)
    for(let j=i+1;j<plan.beds.length;j++)
      if(bedOverlap(plan.beds[i],plan.beds[j]))
        throw Error('Overlapping canopies '+i+'/'+j);
  return true;
}
