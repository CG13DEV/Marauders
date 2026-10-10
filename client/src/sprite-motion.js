/** Spritesheet conventions: 8 genuine orientations x 4 animation poses.
 * 0 front, 1 front-right, 2 right, 3 back-right,
 * 4 back, 5 back-left, 6 left, 7 front-left.
 */
export const VIEWS=8;
export const WALK_FRAMES=4;
export function directionFrame(facing,cameraYaw){
  const d=((facing-cameraYaw)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
  return Math.round(d/(Math.PI/4))%VIEWS;
}
export function animationFrame(seconds,moving){
  return moving?Math.floor(Math.max(0,seconds)*9)%WALK_FRAMES:0;
}
export const SPRITE_VARIANTS=Object.freeze(['player','ginger','dark','blond']);
