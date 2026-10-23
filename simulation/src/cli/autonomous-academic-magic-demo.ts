import {createAutonomousAcademicMagicSlice} from '../scenarios/autonomous-academic-magic.ts';

const {world,remus,lily,library,releaseAfterMissedLesson}=createAutonomousAcademicMagicSlice();
for(let i=0;i<8;i++)world.step();
console.log('[GAME] Ремус пропустил урок:',world.attendance(remus)[0]?.status);
console.log('Лили после занятия:',world.spellStage(lily,'lumos'));
releaseAfterMissedLesson();
for(let i=0;i<140;i++)world.step();
console.log('Ремус после суток автономной жизни:',world.spellStage(remus,'lumos'));
console.log('Записи магических знаний:',world.learningHistory(remus));
console.log('Реальная библиотека:',world.label(library));
console.log('События исследования:',world.events()
  .filter(event=>event.actor===remus &&
    (event.type.startsWith('book_')||event.type==='spell_executed'||
     event.type==='entity_moved'||event.type==='intention_changed'))
  .slice(0,24));
