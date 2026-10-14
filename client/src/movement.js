/**
 * Standalone client-side spatial collision, testable without WebGL.
 * This does NOT change authoritative inter-room routes in Simulation.
 */
export const STARTS=Object.freeze({
  common:Object.freeze({x:0,z:4.4}),
  landing:Object.freeze({x:0,z:1}),
  bedroom:Object.freeze({x:0,z:2.5}),
  gallery:Object.freeze({x:0,z:-4.0})
});
export const PLAYER_RADIUS=.30;
export function walkable(stage,x,z){
  if(stage.bounds){
    if(x<stage.bounds.minX||x>stage.bounds.maxX||
       z<stage.bounds.minZ||z>stage.bounds.maxZ)return false;
  }else if(Math.hypot(x,z)>stage.radius-1.15)return false;
  return !stage.obstacles.some(o=>
    Math.hypot(x-o.x,z-o.z)<o.r+PLAYER_RADIUS);
}
export function safeSpawn(stage,preferred){
  if(walkable(stage,preferred.x,preferred.z))return {...preferred};
  // A bad initial coordinate must NEVER immobilize the player.
  // Search short concentric rings in a deterministic order instead.
  for(let radius=.3;radius<stage.radius;radius+=.3){
    for(let i=0;i<32;i++){
      const a=i*2*Math.PI/32;
      const x=preferred.x+Math.sin(a)*radius;
      const z=preferred.z+Math.cos(a)*radius;
      if(walkable(stage,x,z))return {x,z};
    }
  }
  throw Error('No free avatar spawn in '+stage.radius+'m room');
}
export function moveWithCollision(stage,position,dx,dz){
  const candidates=[
    {x:position.x+dx,z:position.z+dz},
    {x:position.x+dx,z:position.z},
    {x:position.x,z:position.z+dz}
  ];
  for(const candidate of candidates)
    if(walkable(stage,candidate.x,candidate.z))return candidate;
  return position;
}

const PHYSICAL_KEYS=Object.freeze({
  KeyW:'w',KeyA:'a',KeyS:'s',KeyD:'d',
  KeyQ:'q',KeyE:'e',KeyF:'f',
  ArrowUp:'arrowup',ArrowDown:'arrowdown',
  ArrowLeft:'arrowleft',ArrowRight:'arrowright'
});
export function keyForControl(event){
  return PHYSICAL_KEYS[event.code]??null;
}
