/** #27: foundations have a complete 1st/2nd-year curriculum.
 * Run with number of ten-minute ticks (default 144 = one in-world day).
 */
import {performance} from 'node:perf_hooks';
import {createSimulation} from '../core/Simulation.ts';
import {shortestHops} from '../core/school-planner.ts';
import {createSchoolWeek,reportSchoolWeek} from '../scenarios/school-week.ts';
import {FOUNDATION_PROFILE} from '../scenarios/foundation-timetable.ts';

const ticks=process.argv[2]===undefined?144:Number(process.argv[2]);
if(!Number.isSafeInteger(ticks)||ticks<1||ticks>1008)
  throw Error('Ticks must be an integer in [1,1008]');
const started=performance.now();
const s=createSchoolWeek(createSimulation(),'adaptive','autonomous',
  '96-all','expanded','research-600','foundations-27');
const constructionMs=Math.round(performance.now()-started);
const loads=s.foundationTeachers.map(t=>({
  id:t.id,subject:t.subject,periods:s.foundationAssignments.filter(a=>
    a.teacher===t.id).length
}));
const firstYears=s.students.filter(p=>p.year<=2);
const travelWarnings=firstYears.flatMap(p=>{
  const lessons=s.world.attendance(p.id);
  return lessons.slice(1).flatMap((curr,i)=>{
    const previous=lessons[i]!;
    if(Math.floor(curr.startsAt/1440)!==Math.floor(previous.startsAt/1440))
      return [];
    const hops=shortestHops(previous.room,curr.room,room=>s.world.exits(room));
    const breakMinutes=curr.startsAt-previous.endsAt;
    return hops===null||hops*10>breakMinutes
      ?[{pupil:p.id,from:previous.id,to:curr.id,
        hops,breakMinutes}]:[];
  });
});
const at=performance.now();
for(let i=0;i<ticks;i++)s.world.step();
const report=reportSchoolWeek(s);
const youngerAttendance=firstYears.flatMap(p=>s.world.attendance(p.id));
const youngerStatuses=Object.fromEntries(['on_time','late','missed','pending'].map(
  status=>[status,youngerAttendance.filter(x=>x.status===status).length]));
console.log(JSON.stringify({
  scenario:'Experiment 27 — full foundation curriculum (research-only GAME)',
  pupils:s.students.length,firstAndSecondYears:firstYears.length,
  knownStaffAndAdditionalInstructors:s.professors.length,
  additionalFoundationInstructors:s.foundationTeachers.length,
  additionalTeachingRooms:s.foundationSpaces.length,
  foundationClasses:s.foundationAssignments.length,
  allClasses:s.sessions.length,
  weekProfiles:FOUNDATION_PROFILE,
  foundationPeriodsRange:[Math.min(...firstYears.map(p=>s.world.attendance(p.id).length)),
    Math.max(...firstYears.map(p=>s.world.attendance(p.id).length))],
  teacherLoad:{min:Math.min(...loads.map(x=>x.periods)),
    max:Math.max(...loads.map(x=>x.periods)),bySubject:loads},
  physicalTravelWarnings:travelWarnings.length,
  warningExamples:travelWarnings.slice(0,3),
  hoursSimulated:ticks/6,
  foundationAttendance:youngerStatuses,
  totalAttendance:report.attendance,
  meals:report.pupilMeals,conversations:report.pupilConversations,
  benchmark:{constructionMs,
    simulatedMs:Math.round(performance.now()-at)}
},null,2));
