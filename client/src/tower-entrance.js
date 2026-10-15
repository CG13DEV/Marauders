/**
 * [FILM/GAME] Multi-storey Grand Staircase geometry + game-world contact.
 *
 * x/z are shared world-space coordinates within the same rendered atrium.
 * The existing ECS graph has rooms west_landing_3, west_landing_4 and
 * their galleries. There is no invented client-only 'teleport floor'.
 */
export const VESTIBULE_BOUNDS=Object.freeze({
  minX:-1.25,maxX:1.25,minZ:8.32,maxZ:13.45
});
export const COMMON_PORTRAIT_APPROACH=Object.freeze({x:0,z:12.65});
export const UPPER_LEVEL=4.5;
export const LOWER_LEVEL=0;
export const TOWER_PORTRAIT_APPROACH=Object.freeze({x:0,z:-6.72,y:UPPER_LEVEL});
export const TOWER_BOUNDS=Object.freeze({
  minX:-7.90,maxX:7.90,minZ:-7.88,maxZ:7.85
});
export const STAIR_BASE=Object.freeze({x:-5.65,z:-.80,y:LOWER_LEVEL});
export const STAIR_TOP=Object.freeze({x:-5.65,z:3.70,y:UPPER_LEVEL});
export const STAIR_LENGTH=STAIR_TOP.z-STAIR_BASE.z;
export const UPPER_GALLERY_PORTAL=Object.freeze({x:0,z:-4.4,y:UPPER_LEVEL});
export const LOWER_GALLERY_PORTAL=Object.freeze({x:4.75,z:1.5,y:LOWER_LEVEL});

export const isInVestibule=({x,z})=>Number.isFinite(x)&&
  Number.isFinite(z)&&x>=VESTIBULE_BOUNDS.minX&&
  x<=VESTIBULE_BOUNDS.maxX&&z>=VESTIBULE_BOUNDS.minZ&&
  z<=VESTIBULE_BOUNDS.maxZ;

// This floor is a genuine elevated balcony with an L-shaped circulation
// route. Walking off the sides cannot bypass the moving staircase.
export function upperWalkable({x,z}){
  return Number.isFinite(x)&&Number.isFinite(z)&&(
    (x>=-6.45&&x<=.85&&z>=-7.45&&z<=-5.80)||
    (x>=-6.45&&x<=-4.80&&z>=-7.45&&z<=4.15)||
    (x>=-6.50&&x<=-4.90&&z>=2.85&&z<=4.25)||
    // A small elevated gallery port alcove is reachable from the portrait
    // via a contiguous walkway, not a floating interaction marker.
    (x>=-.90&&x<=.90&&z>=-6.9&&z<=-3.65)
  );
}

export const GRAND_STAIR_PERIOD=240;
export function grandStairState(worldSeconds){
  if(!Number.isFinite(worldSeconds)||worldSeconds<0)
    throw Error('Invalid staircase clock');
  const p=worldSeconds%GRAND_STAIR_PERIOD;
  const smooth=t=>t*t*(3-2*t);
  const angle=p<90?0:p<120
    ?Math.PI/2*smooth((p-90)/30):p<180
      ?Math.PI/2:p<210
        ?Math.PI/2*(1-smooth((p-180)/30)):0;
  const aligned=p<90||p>=210;
  return Object.freeze({
    angle,aligned,
    phase:aligned?'upper':p>=120&&p<180?'other_direction':'turning',
    secondsToAlign:aligned?0:Math.ceil(210-p)
  });
}
// Given progress 0 at lower base and 1 at upper landing, the same pivot
// transform drives both the mesh and player feet. No render-time guessing.
export function stairPoint(progress,worldSeconds){
  if(!Number.isFinite(progress)||progress<0||progress>1)
    throw Error('Invalid staircase progress');
  const {angle}=grandStairState(worldSeconds);
  return Object.freeze({
    x:STAIR_BASE.x+Math.sin(angle)*STAIR_LENGTH*progress,
    z:STAIR_BASE.z+Math.cos(angle)*STAIR_LENGTH*progress,
    y:LOWER_LEVEL+(UPPER_LEVEL-LOWER_LEVEL)*progress
  });
}
