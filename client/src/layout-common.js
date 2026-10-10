/**
 * [GAME] Cozy common-room activity islands and CLEAR circulation.
 * Central radial corridors serve the portrait, fireplace and two stairways.
 * Geometry meshes may change; approach areas must remain open.
 */
import {roomAnchor} from './architecture.js';
export function commonPlan(radius=10){
  return {
    couches:[
      {x:-3.55,z:-3.1,angle:-.1},
      {x:3.55,z:-3.1,angle:.1},
      {x:-3.6,z:3.0,angle:Math.PI/2},
      {x:3.6,z:3.0,angle:-Math.PI/2}
    ],
    sideTables:[
      {x:-5.75,z:-1.2,w:1.15,d:.90},
      {x:5.75,z:-1.2,w:1.15,d:.90}
    ],
    writingDesks:[
      {x:-5.45,z:4.6},
      {x:5.45,z:4.6}
    ],
    windowSeats:[
      {...roomAnchor(radius-2.05,-2.42),angle:-2.42},
      {...roomAnchor(radius-2.05,2.42),angle:2.42}
    ],
    carpet:{x:0,z:0,radius:2.65},
    clearance:1.05,
    approaches:[
      {id:'portrait',x:0,z:radius-2.1},
      {id:'boys',...roomAnchor(radius,-Math.PI/2,2.1)},
      {id:'girls',...roomAnchor(radius,Math.PI/2,2.1)},
      {id:'hearth',x:0,z:-(radius-2.1)}
    ]
  };
}
export function validateCommonPlan(plan){
  const obstacles=[
    ...plan.couches.map(p=>({...p,r:1.24})),
    ...plan.sideTables.map(p=>({...p,r:.8})),
    ...plan.writingDesks.map(p=>({...p,r:1.0})),
    ...plan.windowSeats.map(p=>({...p,r:.74}))
  ];
  // A central cross acts as the traversable circulation spine. The soft rug
  // occupies the center but is NOT a collider.
  for(let t=-2;t<=2;t+=.4){
    for(const p of [{x:t,z:0},{x:0,z:t}]){
      if(obstacles.some(o=>Math.hypot(o.x-p.x,o.z-p.z)<o.r+.5))
        throw Error('Common furniture obstructs central crossing');
    }
  }
  for(const p of plan.approaches)
    if(obstacles.some(o=>Math.hypot(o.x-p.x,o.z-p.z)<o.r+.65))
      throw Error('Blocked common-room portal '+p.id);
  return true;
}
