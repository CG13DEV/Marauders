/**
 * Experiment #28 — [GAME] sub-tick traversal of physical school passages.
 *
 * One world tick is 10 minutes, but moving through a *short abstract graph
 * segment* need not consume the entire tick. A validated move or door action
 * consumes 2 simulated minutes from a private journey budget. Every passage
 * remains a real command and produces a real event; there is no teleport.
 *
 * Important: this is a bounded within-tick approximation, NOT continuous
 * UE motion. Lessons still register attendance on the 10-minute clock.
 */
import type {Command,CommandResult} from './Simulation.ts';

export const MICRO_PASSAGE_MINUTES=2;
export const MICRO_TICK_MINUTES=10;

export type MicroStep={action:Command;result:CommandResult};

export function followPhysicalPassages(args:{
  actor:number;
  destination:number;
  startingRoom:number;
  exits(room:number):readonly number[];
  nextRoom(room:number,destination:number,
    exits:(room:number)=>readonly number[]):number|null;
  passageAction(actor:number,room:number,next:number):Command;
  currentRoom(actor:number):number|null;
  execute(action:Command):CommandResult;
  /** When omitted, preserve the Experiment #28 uniform two-minute cost. */
  passageMinutes?:(from:number,to:number)=>number|null;
  budgetMinutes?:number;
}):MicroStep[]{
  const {actor,destination,exits,nextRoom,passageAction,currentRoom,execute}=args;
  const budget=args.budgetMinutes??MICRO_TICK_MINUTES;
  if(!Number.isSafeInteger(budget)||budget<0||budget>MICRO_TICK_MINUTES)
    throw new Error('Invalid micro travel budget');
  const steps:MicroStep[]=[];
  let room=args.startingRoom;
  let remaining=budget;
  // A weighted one-minute passage allows up to ten separate real commands.
  for(let i=0;i<budget&&room!==destination;i++){
    const next=nextRoom(room,destination,exits);
    if(next===null)break;
    const action=passageAction(actor,room,next);
    // Never let an action other than walking or opening a door become a
    // free bonus action via the traversal adapter.
    if(action.type!=='move'&&action.type!=='open_door')
      throw new Error('Invalid physical passage action');
    const price=action.type==='open_door'?MICRO_PASSAGE_MINUTES:
      args.passageMinutes?.(room,next)??
      (args.passageMinutes?null:MICRO_PASSAGE_MINUTES);
    if(price===null)break;
    if(!Number.isSafeInteger(price)||price<1||price>MICRO_TICK_MINUTES)
      throw Error('Invalid physical passage duration');
    if(price>remaining)break;
    remaining-=price;
    const result=execute(action);
    steps.push({action,result});
    if(!result.ok)break;
    const after=currentRoom(actor);
    if(after===null)break;
    // Opening a door is a distinct validated action at the same location.
    if(after===room&&action.type!=='open_door')break;
    room=after;
  }
  return steps;
}
