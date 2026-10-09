/** Experiment #22 [GAME]: need-driven toilet journeys and bounded staff patrols.
 * Deliberately separate from innate human/animal/ghost abilities.
 */
export type ToiletNeed = {urgency:number; bathrooms:number[]; visits:number};
export type PatrolKind='caretaker'|'animal';
/** A bounded detour inferred from a face-to-face alarm, not a remote crime. */
export type PatrolSearch = {
  origin:number;
  pending:number[];
  checked:number[];
};
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
  /** Only a caretaker can investigate. The cat never transmits a location. */
  search?:PatrolSearch;
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

/** [GAME] Explore physically connected passages near the handoff point.
 * Breadth-first and ID-stable. No object positions, witnesses, or event log.
 */
export function nearbySearchRooms(origin:number,exits:(room:number)=>readonly number[],
  maxHops=2,maxRooms=9):number[]{
  const queue:{room:number;hops:number}[]=[{room:origin,hops:0}];
  const seen=new Set([origin]);
  const rooms:number[]=[];
  for(let i=0;i<queue.length&&rooms.length<maxRooms;i++){
    const {room,hops}=queue[i]!;
    rooms.push(room);
    if(hops>=maxHops)continue;
    for(const next of [...exits(room)].sort((a,b)=>a-b)){
      if(seen.has(next))continue;
      seen.add(next);
      queue.push({room:next,hops:hops+1});
    }
  }
  return rooms;
}
