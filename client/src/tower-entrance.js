/**
 * [CANON / FILM / GAME] One coherent entrance coordinate contract.
 *
 * Film: the Fat Lady hangs on a landing of the portrait-filled Grand
 * Staircase. Books: a seventh-floor corridor; no book claim is made here.
 *
 * Vestibule is spatially inside the SAME Gryffindor ECS room. The only
 * ECS threshold is the Fat Lady -> Grand Staircase.
 */
export const VESTIBULE_BOUNDS=Object.freeze({
  minX:-1.25,maxX:1.25,minZ:8.32,maxZ:13.45
});
export const COMMON_PORTRAIT_APPROACH=Object.freeze({x:0,z:12.65});
export const TOWER_PORTRAIT_APPROACH=Object.freeze({x:0,z:-6.72});
export const TOWER_STAIR_APPROACH=Object.freeze({x:0,z:3.85});
export const TOWER_BOUNDS=Object.freeze({
  minX:-7.90,maxX:7.90,minZ:-7.88,maxZ:7.85
});

export const isInVestibule=({x,z})=>Number.isFinite(x)&&
  Number.isFinite(z)&&x>=VESTIBULE_BOUNDS.minX&&
  x<=VESTIBULE_BOUNDS.maxX&&z>=VESTIBULE_BOUNDS.minZ&&
  z<=VESTIBULE_BOUNDS.maxZ;

// The pivot and every reachable route use GAME WORLD SECONDS, never frames.
// A flight joins the gallery landing at yaw=0, turns toward a view balcony,
// then returns. No mid-rotation boarding and no unsupported destination.
export const GRAND_STAIR_PERIOD=240;
export function grandStairState(worldSeconds){
  if(!Number.isFinite(worldSeconds)||worldSeconds<0)
    throw Error('Invalid staircase clock');
  const p=worldSeconds%GRAND_STAIR_PERIOD;
  const smooth=t=>t*t*(3-2*t);
  const angle=p<90?0:p<120
    ?-Math.PI/2*smooth((p-90)/30):p<180
      ?-Math.PI/2:p<210
        ?-Math.PI/2*(1-smooth((p-180)/30)):0;
  const aligned=p<90||p>=210;
  return Object.freeze({
    angle,aligned,
    phase:aligned?'gallery':p>=120&&p<180?'balcony':'turning',
    secondsToAlign:aligned?0:Math.ceil(210-p)
  });
}
