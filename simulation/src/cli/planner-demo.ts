import { createSimulation } from '../core/Simulation.ts';
import { createSchoolWeek, reportSchoolWeek } from '../scenarios/school-week.ts';

console.log('Мародёры / эксперимент №14: прежний планировщик против маршрутного');
for (const mode of ['legacy','adaptive'] as const) {
  const world=createSimulation();
  const scene=createSchoolWeek(world,mode,'off');
  for(let i=0;i<1008;i++)world.step();
  const report=reportSchoolWeek(scene);
  console.log(mode+': '+JSON.stringify({
    onTime:report.attendance.on_time,
    late:report.attendance.late,
    missed:report.attendance.missed,
    meals:report.pupilMeals,
    conversations:report.pupilConversations/2,
    withinHouse:report.withinHouseConversations,
    acrossHouse:report.acrossHouseConversations,
    learnedLumos:report.firstYearKnowsLumos,
    rests:report.pupilRests,
    moves:world.events().filter(e=>e.type==='entity_moved').length,
    pupils:report.pupils,
    sessions:report.teachingSessions
  }));
}
