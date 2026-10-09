/** Experiment #29 — two students in one world, only one knows the shortcut. */
import {createSimulation} from '../core/Simulation.ts';
import {shortestWeightedRoute,nextWeightedRoom} from '../core/weighted-navigation.ts';
import {followPhysicalPassages} from '../core/physical-travel.ts';

const w=createSimulation();
const entrance=w.room('entrance','Вестибюль');
const stairs=w.room('stairs','Длинная лестница');
const gallery=w.room('gallery','Промежуточная галерея');
const destination=w.room('destination','Класс чар');
w.connect(entrance,stairs,{travelMinutes:8});
w.connect(stairs,destination,{travelMinutes:8});
w.connect(entrance,gallery,{travelMinutes:3});
w.connect(gallery,destination,{travelMinutes:4});
w.connect(entrance,destination,{hidden:true,travelMinutes:2});
const uninformed=w.character('uninformed','Не знающий прохода',entrance);
const explorer=w.character('explorer','Исследователь',entrance);
const route=(actor:number)=>shortestWeightedRoute(entrance,destination,
  r=>w.knownExits(actor,r),(a,b)=>w.passageMinutes(actor,a,b));
const before={uninformed:route(uninformed),explorer:route(explorer)};
w.execute({type:'search_passages',actor:explorer});
const after={uninformed:route(uninformed),explorer:route(explorer)};
const actual=followPhysicalPassages({
  actor:explorer,startingRoom:entrance,destination,
  exits:r=>w.knownExits(explorer,r),
  nextRoom:(a,b,fn)=>nextWeightedRoom(a,b,fn,
    (x,y)=>w.passageMinutes(explorer,x,y)),
  passageAction:(actor,room,next)=>({type:'move' as const,actor,destination:next}),
  passageMinutes:(a,b)=>w.passageMinutes(explorer,a,b),
  currentRoom:actor=>w.currentRoom(actor),execute:command=>w.execute(command)
});
if(before.uninformed?.minutes!==7||before.explorer?.minutes!==7||
   after.uninformed?.minutes!==7||after.explorer?.minutes!==2||
   w.currentRoom(explorer)!==destination||actual.length!==1)
  throw Error('Weighted secret passage failed its causal demonstration');
console.log(JSON.stringify({
  experiment:29,graph:'[GAME] synthetic weighted physical corridors',
  before,after,
  actualValidatedCommands:actual.length,
  realMovementEvents:w.events().filter(e=>e.type==='entity_moved'),
  discovered:w.passageDiscoveries(explorer),
  uninformedStillCannotUseShortcut:w.passageMinutes(uninformed,entrance,destination)===null
},null,2));
