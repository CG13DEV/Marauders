/** [GAME] Experiment #26: empirical 600-pupil simulation trial.
 * Usage: npm run population-demo -- 144
 */
import {performance} from 'node:perf_hooks';
import {createSchoolWeek,reportSchoolWeek}
  from '../scenarios/school-week.ts';
import {createSimulation} from '../core/Simulation.ts';
import {populationSummary,RESEARCH_DORM_CAPACITY}
  from '../scenarios/school-population.ts';

const requested=process.argv[2]===undefined?144:Number(process.argv[2]);
if(!Number.isSafeInteger(requested)||requested<1||requested>1008)
  throw new Error('Ticks must be a whole number between 1 and 1008');
const start=performance.now();
const scene=createSchoolWeek(createSimulation(),'adaptive','autonomous',
  '96-all','expanded','research-600');
const setupMs=Math.round(performance.now()-start);
const occupied=new Map<number,number>();
for(const s of scene.students)
  occupied.set(s.dormRoom,(occupied.get(s.dormRoom)??0)+1);
const simStart=performance.now();
for(let tick=0;tick<requested;tick++)scene.world.step();
const durationMs=Math.round(performance.now()-simStart);
const report=reportSchoolWeek(scene);
const {world}=scene;
const output={
  scenario:'research-600',
  scale:'[GAME] approximate 1971 model, not canonical enrolment',
  demographics:populationSummary(),
  pupils:scene.students.length,
  professors:scene.professors.length,
  namedAdditionalResidents:scene.residents?.people.length??0,
  teachingGroups:scene.teachingGroups.length,
  teachingSessions:scene.sessions.length,
  bedrooms:occupied.size,
  maxPupilsPerBedroom:Math.max(...occupied.values()),
  bedroomCapacity:RESEARCH_DORM_CAPACITY,
  maximumSessionSize:Math.max(...scene.sessions.map(s=>s.students.length)),
  elapsedTicks:requested,
  elapsedSchoolDays:report.elapsedDays,
  attendance:report.attendance,
  meals:report.pupilMeals,
  conversations:report.pupilConversations,
  rests:report.pupilRests,
  bathroomVisits:world.events().filter(e=>e.type==='toilet_used').length,
  physicalMoves:world.events().filter(e=>e.type==='entity_moved').length,
  socialInvitations:report.invitations,
  acceptedInvitations:report.acceptedInvitations,
  automaticIntentionPupils:scene.population.pupils,
  staffReport:world.events().filter(e=>e.type==='testimony_delivered').length,
  benchmark:{setupMs,simulationMs:durationMs,
    ticksPerSecond:Number((requested/(durationMs/1000||1)).toFixed(2))}
};
console.log(JSON.stringify(output,null,2));
