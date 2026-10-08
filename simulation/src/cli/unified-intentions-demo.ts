import { createSimulation } from '../core/Simulation.ts';
import { createSchoolWeek,reportSchoolWeek } from '../scenarios/school-week.ts';

function common(){
  const w=createSimulation();
  const home=w.room('home','Гостиная'),hall=w.room('hall','Коридор');
  const library=w.room('library','Библиотека');
  const classroom=w.room('classroom','Кабинет Чар');
  w.connect(home,hall);w.connect(hall,library);w.connect(hall,classroom);
  const student=w.character('student','Первокурсник',home);
  const mentor=w.character('mentor','Старшекурсник',home);
  const plan={homeRoom:home,diningRoom:home,socialRoom:home,
    style:'reserved' as const,interest:'lessons' as const,
    socialInvitations:true,intentionPlanning:true};
  w.setDailyLife(student,{...plan,learningAppointments:true,leisureRoom:library});
  w.setDailyLife(mentor,plan);
  return {w,home,hall,library,classroom,student,mentor};
}
function missingLesson(){
  const {w,student,mentor,classroom}=common();
  w.seedSpellKnowledge(mentor,'lumos','conceptual');w.setHelpful(mentor,true);
  w.setHelpSeeking(student,true);
  w.setTimetable(student,[{id:'charm',subject:'Чары',room:classroom,
    startsAt:520,endsAt:570,spell:'lumos'}]);
  w.setManualControl(student,true);
  for(let i=0;i<10;i++)w.step();
  w.setManualControl(student,false);
  for(let i=10;i<216;i++)w.step();
  return {knowledge:w.spellStage(student,'lumos'),
    meeting:w.meetingLedger().map(x=>({status:x.status,taught:x.taught===true})),
    intentions:w.intentionHistory(student).map(g=>({kind:g.kind,status:g.status})),
    assistance:w.assistance(student).length};
}
function localInvestigation(){
  const {w,student,home}=common();
  const cup=w.fragileObject('cup','Чашка',home);
  const a=w.character('a','Свидетель A',home);
  const b=w.character('b','Свидетель B',home);
  w.setInquisitive(student,true);
  w.execute({type:'tell',actor:a,listener:student,
    claim:{kind:'broke_object',culprit:a,object:cup}});
  w.execute({type:'tell',actor:b,listener:student,
    claim:{kind:'broke_object',culprit:b,object:cup}});
  for(let i=0;i<3;i++)w.step();
  return {intention:w.intentionHistory(student).map(g=>({kind:g.kind,status:g.status})),
    inspected:w.observations(student).filter(o=>o.kind==='inspected_object').length};
}
console.log('Experiment #19 / One queue: real learning, meetings and investigation');
console.log('study:',JSON.stringify(missingLesson()));
console.log('investigation:',JSON.stringify(localInvestigation()));
const control=createSimulation(),scene=createSchoolWeek(control);
for(let i=0;i<1008;i++)control.step();
const r=reportSchoolWeek(scene);
console.log('week_control:',JSON.stringify({pupils:r.pupils,professors:r.professors,
  onTime:r.attendance.on_time,late:r.attendance.late,missed:r.attendance.missed,
  invitations:r.invitations,fulfilled:r.fulfilledMeetings,lumos:r.firstYearKnowsLumos}));
