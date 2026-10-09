import { createSimulation } from '../core/Simulation.ts';
import { createSchoolWeek,reportSchoolWeek } from '../scenarios/school-week.ts';

function hungerInterruptedVisit(){
  const w=createSimulation();
  const home=w.room('home','Гостиная и трапезная');
  const hall=w.room('hall','Коридор');
  const library=w.room('library','Библиотека');
  w.connect(home,hall);w.connect(hall,library);
  const pupil=w.character('pupil','Первокурсник',home);
  w.setDailyLife(pupil,{homeRoom:home,diningRoom:home,socialRoom:home,
    style:'reserved',interest:'lessons',intentionPlanning:true});
  for(let i=0;i<23;i++)w.step(); // 11:50
  const started=w.execute({type:'intend_visit',actor:pupil,
    destination:library,importance:'casual'});
  if(!started.ok)throw new Error('Could not form a personal intention');
  for(let i=0;i<7;i++)w.step();
  return {
    goal:w.intentionHistory(pupil)[0],
    hunger:w.needsOf(pupil)?.hunger,
    breakfastAndLunch:w.mealHistory(pupil).map(x=>x.kind),
    transitions:w.events().filter(x=>x.type==='intention_changed')
      .map(x=>({at:x.minute,status:x.status,
        ...(x.interruptedBy?{reason:x.interruptedBy}:{})})),
    finalRoom:w.currentRoom(pupil)===library?'library':'elsewhere'
  };
}
function classInterruptedVisit(){
  const w=createSimulation();
  const home=w.room('home','Спальня');
  const hall=w.room('hall','Коридор');
  const classroom=w.room('classroom','Класс');
  const library=w.room('library','Библиотека');
  w.connect(home,hall);w.connect(hall,library);w.connect(hall,classroom);
  const pupil=w.character('student','Старшекурсник',home);
  w.setDailyLife(pupil,{homeRoom:home,diningRoom:home,
    style:'reserved',interest:'castle',intentionPlanning:true});
  w.setTimetable(pupil,[{id:'charms',room:classroom,subject:'Чары',
    startsAt:520,endsAt:570}]);
  w.execute({type:'intend_visit',actor:pupil,
    destination:library,importance:'important'});
  for(let i=0;i<12;i++)w.step();
  return {goal:w.intentionHistory(pupil)[0],
    classStatus:w.attendance(pupil)[0]?.status,
    transitions:w.events().filter(x=>x.type==='intention_changed')
      .map(x=>({at:x.minute,status:x.status,
        ...(x.interruptedBy?{reason:x.interruptedBy}:{})}))};
}
console.log('Experiment #18 / goal continuity, hunger and rest');
console.log('meal_pause:',JSON.stringify(hungerInterruptedVisit()));
console.log('class_pause:',JSON.stringify(classInterruptedVisit()));
const control=createSimulation();
const scene=createSchoolWeek(control);
for(let i=0;i<1008;i++)control.step();
const summary=reportSchoolWeek(scene);
console.log('school_control:',JSON.stringify({onTime:summary.attendance.on_time,
  late:summary.attendance.late,missed:summary.attendance.missed,
  invitations:summary.invitations,fulfilledMeetings:summary.fulfilledMeetings,
  knowsLumos:summary.firstYearKnowsLumos}));
