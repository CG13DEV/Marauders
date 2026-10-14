/**
 * RB-1: a deliberately minimal public, room-level observation contract.
 * Never expose RuntimeSnapshot: it includes private NPC memories and beliefs.
 * This adapter has no authority over the simulation.
 */
import type {WorldEvent} from './Simulation.ts';

export type PublicRoomSnapshot = {
  version:1;
  sequence:number;
  tick:number;
  locations:readonly (readonly [string,string])[];
};
export type PublicRoomDelta = {
  version:1;
  sequence:number;
  tick:number;
  movements:readonly {actor:string;from:string;to:string}[];
};
export type RoomObserverWorld = {
  tick():number;
  id(key:string):number|undefined;
  currentRoom(actor:number):number|null;
  events():WorldEvent[];
};
export class PassiveRoomObserver {
  private sequence=0;
  private readonly positions=new Map<string,string>();
  constructor(snapshot:PublicRoomSnapshot) {
    if(snapshot.version!==1||!Number.isSafeInteger(snapshot.sequence)||snapshot.sequence<0)
      throw Error('Invalid observer snapshot');
    this.sequence=snapshot.sequence;
    for(const [actor,room] of snapshot.locations) {
      if(this.positions.has(actor))throw Error('Duplicate observed actor');
      this.positions.set(actor,room);
    }
  }
  apply(delta:PublicRoomDelta):void {
    if(delta.version!==1||delta.sequence!==this.sequence+1)
      throw Error('Observer sequence gap or duplicate');
    const next=new Map(this.positions);
    for(const move of delta.movements) {
      if(next.get(move.actor)!==move.from)
        throw Error('Observer continuity violation');
      next.set(move.actor,move.to);
    }
    this.positions.clear();
    for(const [actor,room] of next)this.positions.set(actor,room);
    this.sequence=delta.sequence;
  }
  roomOf(actor:string):string|undefined{return this.positions.get(actor);}
  state():readonly (readonly [string,string])[]{
    return [...this.positions].sort(([a],[b])=>a.localeCompare(b));
  }
}
export function roomSnapshot(world:RoomObserverWorld,actorKeys:readonly string[],
  roomKeys:readonly string[],sequence=0):PublicRoomSnapshot {
  const roomById=new Map(roomKeys.map(key=>[world.id(key),key]));
  const locations=actorKeys.map(key=>{
    const id=world.id(key);
    if(id===undefined)throw Error('Unknown public actor');
    const room=world.currentRoom(id);
    const roomKey=roomById.get(room??undefined);
    if(roomKey===undefined)throw Error('Actor outside published rooms');
    return [key,roomKey] as const;
  });
  return {version:1,sequence,tick:world.tick(),locations};
}
export function roomDelta(world:RoomObserverWorld,events:readonly WorldEvent[],
  actorKeys:readonly string[],roomKeys:readonly string[],sequence:number):PublicRoomDelta {
  const actors=new Map(actorKeys.map(key=>[world.id(key),key]));
  const rooms=new Map(roomKeys.map(key=>[world.id(key),key]));
  const movements=events.flatMap(event=>{
    if(event.type!=='entity_moved')return [];
    const actor=actors.get(event.actor),from=rooms.get(event.from),to=rooms.get(event.to);
    if(!actor||!from||!to)return [];
    return [{actor,from,to}];
  });
  return {version:1,sequence,tick:world.tick(),movements};
}
