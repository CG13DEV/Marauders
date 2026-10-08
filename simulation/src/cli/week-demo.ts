import { createSchoolWeek, reportSchoolWeek } from '../scenarios/school-week.ts';

const scene=createSchoolWeek();
console.log('Мародёры / эксперимент №10: школьная неделя, семь курсов');
console.log('Учеников:', scene.students.length, 'Преподавателей:',scene.professors.length);
for(let day=0;day<7;day++){
  for(let t=0;t<144;t++) scene.world.step();
  const data=reportSchoolWeek(scene);
  console.log('День',day+1,'уроков завершено:',
    data.attendance.on_time+data.attendance.late+data.attendance.missed,
    'пропущено:',data.attendance.missed);
}
const result=reportSchoolWeek(scene);
console.log('Итог недели:',JSON.stringify(result));
if(result.attendance.pending!==0 || result.pupilLessonSlots!==1260)
  throw new Error('School-week validation failed');
