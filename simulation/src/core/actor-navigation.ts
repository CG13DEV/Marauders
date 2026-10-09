/**
 * #30 [GAME] One weighted, actor-local travel service for ALL daily activities.
 * Planning and execution share the same known graph. No global secret lookup.
 * All locomotion is validated through the world (including intermediate rooms).
 */
import type {Command,CommandResult} from './Simulation.ts';
import {shortestWeightedRoute,type WeightedRoute} from './weighted-navigation.ts';
import {followPhysicalPassages,type MicroStep} from './physical-travel.ts';

export type ActorTravelWorld={
  knownExits(actor:number,room:number):readonly number[];
  passageMinutes(actor:number,from:number,to:number):number|null;
  /** Optional topology-versioned memoizer owned by a single ECS world. */
  planActorRoute?(actor:number,from:number,to:number):WeightedRoute|null;
  passageAction(actor:number,room:number,next:number):Command;
  currentRoom(actor:number):number|null;
  execute(command:Command):CommandResult;
};
export function getActorRoute(world:Pick<ActorTravelWorld,
  'knownExits'|'passageMinutes'|'planActorRoute'>,
  actor:number,from:number,to:number):WeightedRoute|null{
  if(world.planActorRoute)return world.planActorRoute(actor,from,to);
  return shortestWeightedRoute(from,to,
    room=>world.knownExits(actor,room),
    (a,b)=>world.passageMinutes(actor,a,b));
}
export function actorJourneyDuration(world:Pick<ActorTravelWorld,
  'knownExits'|'passageMinutes'|'planActorRoute'>,actor:number,from:number,to:number):number|null{
  return getActorRoute(world,actor,from,to)?.minutes??null;
}
export function actorNextRoom(world:Pick<ActorTravelWorld,
  'knownExits'|'passageMinutes'|'planActorRoute'>,actor:number,from:number,to:number):number|null{
  return getActorRoute(world,actor,from,to)?.rooms[1]??null;
}
export function traverseActorJourney(
  world:ActorTravelWorld,actor:number,from:number,to:number
):MicroStep[]{
  const cachedRoute=getActorRoute(world,actor,from,to);
  if(!cachedRoute)return [];
  return followPhysicalPassages({
    actor,startingRoom:from,destination:to,
    exits:room=>world.knownExits(actor,room),
    nextRoom:(room,_goal,exits)=>{
      const i=cachedRoute.rooms.indexOf(room);
      if(i<0||i>=cachedRoute.rooms.length-1)return null;
      const next=cachedRoute.rooms[i+1]!;
      return exits(room).includes(next)?next:null;
    },
    passageAction:world.passageAction,
    currentRoom:world.currentRoom,
    execute:world.execute,
    passageMinutes:(a,b)=>world.passageMinutes(actor,a,b)
  });
}
