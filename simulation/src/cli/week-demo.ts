import { createSchoolWeek, reportSchoolWeek } from '../scenarios/school-week.ts';

const scene=createSchoolWeek();
console.log('Мародёры / эксперимент №10: школьная неделя, семь курсов');
console.log('Учеников:', scene.students.length, 'Преподавателей:',scene.professors.length);
console.log('Замок:',scene.layout.places.size,'помещения на',
  new Set([...scene.layout.places.values()].map(place => place.floor)).size,'уровнях');
console.log('Общие пространства:',[scene.world.label(scene.courtyard),
  scene.world.label(scene.hospital),scene.world.label(scene.library)].join(', '));
for(let day=0;day<7;day++){
  for(let t=0;t<144;t++) scene.world.step();
  const data=reportSchoolWeek(scene);
  console.log('День',day+1,'уроков завершено:',
    data.attendance.on_time+data.attendance.late+data.attendance.missed,
    'пропущено:',data.attendance.missed);
}
const result=reportSchoolWeek(scene);
console.log('Итог недели:',JSON.stringify(result));
const pupil=scene.students[0]!;
const encounters=scene.world.conversationHistory(pupil.id).slice(0,4)
  .map(memory => ({
    with: scene.world.label(memory.partner),
    topic: memory.topic,
    day: Math.floor(memory.minute/1440)+1
  }));
console.log('Пример личной социальной истории:',JSON.stringify({student:pupil.key,encounters}));
if(result.attendance.pending!==0 || result.pupilLessonSlots!==750 ||
    result.pupilConversations===0 || result.acrossHouseConversations===0 ||
    result.withinHouseConversations===0 || result.pupilMeals===0 || result.pupilRests===0)
  throw new Error('School-week validation failed');
