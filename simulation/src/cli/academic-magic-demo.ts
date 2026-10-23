import { createAcademicMagicSlice } from '../scenarios/academic-magic.ts';

const {world,lily,remus,textbook} = createAcademicMagicSlice();
for(let i=0;i<8;i++)world.step();
console.log('[GAME] Урок чар завершён.');
console.log('Лили:',world.spellStage(lily,'lumos'));
console.log('Ремус пропустил занятие:',world.attendance(remus)[0]?.status);
console.log('Ремус видит книги:',world.visibleBooks(remus));
console.log('Начинает самостоятельное чтение:',world.execute({type:'study_book',actor:remus,book:textbook}));
world.step();world.step();
console.log('После двадцати игровых минут:',world.spellStage(remus,'lumos'));
console.log('История знаний:',world.learningHistory(remus));
console.log('Самостоятельно применить Lumos ещё нельзя:',world.execute({
  type:'cast_spell',actor:remus,spell:'lumos',
  intent:'illuminate',target:'wand_tip',incantation:'Lumos'
}));
