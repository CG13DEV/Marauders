/** Experiment #22 [GAME]: need-driven toilet journeys and bounded staff patrols.
 * Deliberately separate from innate human/animal/ghost abilities.
 */
export type ToiletNeed = {urgency:number; bathrooms:number[]; visits:number};
export type PatrolKind='caretaker'|'animal';
export type PatrolPlan = {
  kind:PatrolKind;
  waypoints:number[];
  waypoint:number;
  /** Animal signals only after face-to-face contact, never telepathy. */
  partner?:number;
  rendezvous?:number;
  sentSignals:number;
  /** Caretaker's reports already delivered to a specific staff witness. */
  reportedClaims:string[];
};
/** Ten-minute tick coefficients are GAME-scale, not health assertions. */
export function advanceToiletNeed(state:ToiletNeed,isSleeping:boolean):ToiletNeed{
  const gain=isSleeping?0.28:1.2;
  return {...state,urgency:Math.min(100,Math.round((state.urgency+gain)*100)/100)};
}
export function closestBathroom(current:number, rooms:readonly number[],
  hops:(from:number,to:number)=>number|null):number|null{
  const viable=rooms.map(id=>({id,distance:hops(current,id)}))
    .filter((r):r is {id:number;distance:number}=>r.distance!==null)
    .sort((a,b)=>a.distance-b.distance||a.id-b.id);
  return viable[0]?.id??null;
}
