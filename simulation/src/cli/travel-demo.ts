/**
 * Experiment #28: compare 600-person foundation pupils with and without
 * validated multi-edge travel inside one 10-minute planning tick.
 * Run: npm run travel-demo -- 144
 */
import {performance} from 'node:perf_hooks';
import {createSimulation} from '../core/Simulation.ts';
import {createSchoolWeek,reportSchoolWeek} from '../scenarios/school-week.ts';
import {MICRO_PASSAGE_MINUTES} from '../core/physical-travel.ts';

const ticks=process.argv[2]===undefined?144:Number(process.argv[2]);
if(!Number.isSafeInteger(ticks)||ticks<1||ticks>1008)
  throw Error('Ticks must be an integer between 1 and 1008');

function run(travel:'legacy'|'micro-28'){
  const started=performance.now();
  const s=createSchoolWeek(createSimulation(),'adaptive','autonomous','96-all',
    'expanded','research-600','foundations-27',travel);
  const setupMs=Math.round(performance.now()-started);
  const counts=new Map<number,number>();
  let multiPassageTicks=0,verifiedTravelActions=0;
  const t=performance.now();
  for(let step=0;step<ticks;step++){
    const decisions=s.world.step();
    counts.clear();
    for(const d of decisions){
      if(d.action.type!=='move'&&d.action.type!=='open_door')continue;
      if(!d.result.ok)continue;
      verifiedTravelActions++;
      counts.set(d.actor,(counts.get(d.actor)??0)+1);
    }
    if([...counts.values()].some(c=>c>1))multiPassageTicks++;
  }
  const ms=Math.round(performance.now()-t);
  const junior=s.students.filter(p=>p.year<=2);
  const records=junior.flatMap(p=>s.world.attendance(p.id));
  const statuses=Object.fromEntries(['on_time','late','missed','pending'].map(
    status=>[status,records.filter(x=>x.status===status).length]));
  return {
    mode:travel,simulationMs:ms,setupMs,
    inhabitants:s.students.length+s.professors.length+(s.residents?.people.length??0),
    pupils:s.students.length,juniors:junior.length,
    schoolTimetableLessons:s.sessions.length,
    availablePeriodsPerJunior:[19,20],
    visitedSchoolBlocks:statuses,
    schoolWideAttendance:reportSchoolWeek(s).attendance,
    verifiedTravelActions,multiPassageTicks
  };
}
console.log(JSON.stringify({
  experiment:28,
  assumptions:{planningTickMinutes:10,microPassageMinutes:MICRO_PASSAGE_MINUTES,
    microPathCanCrossClosedDoorAutomatically:false,
    attendanceResolutionMinutes:10},
  baseline:run('legacy'),
  optIn:run('micro-28')
},null,2));
