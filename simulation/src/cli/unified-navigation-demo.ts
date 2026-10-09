/** #30: real 600-pupil Hogwarts with one actor-local weighted route policy. */
import {performance} from 'node:perf_hooks';
import {createSimulation} from '../core/Simulation.ts';
import {createSchoolWeek,reportSchoolWeek} from '../scenarios/school-week.ts';

const ticks=process.argv[2]===undefined?96:Number(process.argv[2]);
if(!Number.isSafeInteger(ticks)||ticks<1||ticks>1008)
  throw Error('Ticks must be an integer in [1,1008]');

const started=performance.now();
const s=createSchoolWeek(createSimulation(),'adaptive','autonomous',
  '96-all','expanded','research-600','foundations-27','unified-30');
const setupMs=Math.round(performance.now()-started);
const filch=s.residents?.people.find(p=>p.key==='caretaker_filch')?.id;
const norris=s.residents?.people.find(p=>p.key==='mrs_norris')?.id;
const expectedActors=new Set([
  ...s.students.map(p=>p.id),...s.professors.map(p=>p.id),
  ...(s.residents?.people.map(p=>p.id)??[])
]);
if(expectedActors.size!==634||[...expectedActors].some(id=>!s.world.usesUnifiedTravel(id)))
  throw Error('Experiment 30 requires every resident to opt in');
let moves=0,doors=0,ticksWithMultiMovement=0,patrolMoves=0,failedTravel=0;
const simStart=performance.now();
for(let i=0;i<ticks;i++){
  const choices=s.world.step();
  const moved=new Map<number,number>();
  for(const record of choices){
    if(record.action.type!=='move'&&record.action.type!=='open_door')continue;
    if(!record.result.ok){failedTravel++;continue;}
    if(record.action.type==='move')moves++;
    else doors++;
    moved.set(record.actor,(moved.get(record.actor)??0)+1);
    if(record.actor===filch||record.actor===norris)patrolMoves++;
  }
  if([...moved.values()].some(n=>n>1))ticksWithMultiMovement++;
}
const report=reportSchoolWeek(s);
console.log(JSON.stringify({
  experiment:30,scenario:'[GAME] all-resident unified weighted school travel',
  planningTickMinutes:10,ticks,
  pupils:s.students.length,professors:s.professors.length,
  residents:s.residents?.people.length??0,
  optedActors:expectedActors.size,
  actions:{moves,doors,patrolMoves,failedTravel,ticksWithMultiMovement},
  attendance:report.attendance,pupilMeals:report.pupilMeals,
  pupilConversations:report.pupilConversations,
  knowledgeIsolation:{
    firstPupilSecretPassages:s.world.passageDiscoveries(s.students[0]!.id).length,
    filchSecretPassages:filch===undefined?null:s.world.passageDiscoveries(filch).length
  },
  benchmark:{setupMs,simulatedMs:Math.round(performance.now()-simStart)},
  ...(process.env.MARAUDERS_ROUTE_PROFILE==='1'?{routeProfile:s.world.routeProfile()}:{}),
  ...(process.env.MARAUDERS_TICK_PROFILE==='1'?{tickProfile:s.world.tickProfile()}:{})
},null,2));
if(!ticksWithMultiMovement||!moves||!patrolMoves)
  throw Error('Unified physics must produce real multi-passage and patrol movement');
