import { createSimulation } from '../core/Simulation.ts';
import { createSchoolWeek, reportSchoolWeek } from '../scenarios/school-week.ts';

console.log('Мародёры / Experiment #16: приглашения и согласие без сценариста');
for(const social of ['off','autonomous'] as const){
  const world=createSimulation();
  const scene=createSchoolWeek(world,'adaptive',social);
  for(let tick=0;tick<1008;tick++)world.step();
  const meetings=world.meetingLedger();
  const result=reportSchoolWeek(scene);
  console.log(social+': '+JSON.stringify({
    offered:meetings.length,
    accepted:meetings.filter(m=>['pending','kept','expired'].includes(m.status)).length,
    rejected:meetings.filter(m=>m.status==='declined').length,
    kept:meetings.filter(m=>m.status==='kept').length,
    expired:meetings.filter(m=>m.status==='expired').length,
    unanswered:meetings.filter(m=>m.status==='unanswered').length,
    onTime:result.attendance.on_time,
    late:result.attendance.late,
    missed:result.attendance.missed,
    meals:result.pupilMeals,
    conversations:result.pupilConversations/2,
    interHouse:result.acrossHouseConversations,
    learnedLumos:result.firstYearKnowsLumos
  }));
}
