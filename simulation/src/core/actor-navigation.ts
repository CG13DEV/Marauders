/**
 * #30 [GAME] One weighted, actor-local travel service for ALL daily activities.
 * Planning and execution share the same known graph. No global secret lookup.
 * All locomotion is validated through the world (including intermediate rooms).
 */
import type {Command,CommandResult} from './Simulation.ts';
import {shortestWeightedRoute,nextWeightedRoom} from './weighted-navigation.ts';
import {followPhysicalPassages,type MicroStep} from './physical-travel.ts';

export type ActorTravelWorld={
  knownExits(actor:number,room:number):readonly number[];
  passageMinutes(actor:number,from:number,to:number):number|null;
  passageAction(actor:number,room:number,next:number):Command;
  currentRoom(actor:number):number|null;
  execute(command:Command):CommandResult;
};
export function actorJourneyDuration(world:Pick<ActorTravelWorld,
  'knownExits'|'passageMinutes'>,actor:number,from:number,to:number):number|null{
  return shortestWeightedRoute(from,to,
    room=>world.knownExits(actor,room),
    (a,b)=>world.passageMinutes(actor,a,b))?.minutes??null;
}
export function actorNextRoom(world:Pick<ActorTravelWorld,
  'knownExits'|'passageMinutes'>,actor:number,from:number,to:number):number|null{
  return nextWeightedRoom(from,to,
    room=>world.knownExits(actor,room),
    (a,b)=>world.passageMinutes(actor,a,b));
}
export function traverseActorJourney(
  world:ActorTravelWorld,actor:number,from:number,to:number
):MicroStep[]{
  return followPhysicalPassages({
    actor,startingRoom:from,destination:to,
    exits:room=>world.knownExits(actor,room),
    nextRoom:(a,b,exits)=>nextWeightedRoom(a,b,exits,
      (x,y)=>world.passageMinutes(actor,x,y)),
    passageAction:world.passageAction,
    currentRoom:world.currentRoom,
    execute:world.execute,
    passageMinutes:(a,b)=>world.passageMinutes(actor,a,b)
  });
}
