import { createSimulation } from '../core/Simulation.ts';
import { createSchoolWeek, reportSchoolWeek } from '../scenarios/school-week.ts';
function scenario(qualified:boolean){
 const w=createSimulation();
 const common=w.room('common','Гостиная'),library=w.room('library','Библиотека');
 const classroom=w.room('classroom','Кабинет чар');
 w.connect(common,library);w.connect(common,classroom);
 const pupil=w.character('pupil','Первокурсник',common),mentor=w.character('mentor','Старшекурсник',common);
 w.setDailyLife(pupil,{homeRoom:common,diningRoom:common,socialRoom:common,leisureRoom:library,
  style:'reserved',interest:'lessons',learningAppointments:true,socialInvitations:true});
 w.setDailyLife(mentor,{homeRoom:common,diningRoom:common,socialRoom:common,
  style:'reserved',interest:'lessons',socialInvitations:true});
 w.setHelpful(mentor,true);if(qualified)w.seedSpellKnowledge(mentor,'lumos','conceptual');
 w.setHelpSeeking(pupil,true);
 w.setTimetable(pupil,[{id:'charm',subject:'Чары',room:classroom,
  startsAt:520,endsAt:570,spell:'lumos'}]);
 w.setManualControl(pupil,true);for(let i=0;i<10;i++)w.step();
 w.setManualControl(pupil,false);for(let i=10;i<215;i++)w.step();
 const m=w.meetingLedger()[0];
 console.log(JSON.stringify({mentorQualified:qualified,meeting:m?.status,
  actuallyTaught:m?.taught===true,class:w.attendance(pupil)[0]?.status,
  learned:w.spellStage(pupil,'lumos'),help:w.assistance(pupil).length,
  memories:w.promiseHistory(pupil).map(x=>x.kind)}));
}
console.log('Experiment #17 — need -> request -> consent -> meeting -> instruction');
scenario(true);scenario(false);
const world=createSimulation(),week=createSchoolWeek(world);
for(let i=0;i<1008;i++)world.step();
const r=reportSchoolWeek(week);
console.log('control:',JSON.stringify({onTime:r.attendance.on_time,
 late:r.attendance.late,invitations:r.invitations,lumos:r.firstYearKnowsLumos}));
