import { createSimulation } from '../core/Simulation.ts';
import { introductorySpellFor } from './curriculum.ts';

/**
 * [GAME] First vertical slice linking timetable attendance, physical library
 * sources, personal spell knowledge, and the *existing* spell execution rule.
 * Not a reconstructed 1970s year-one syllabus or spell-graph runtime.
 */
export function createAcademicMagicSlice() {
  const world = createSimulation();
  const classroom = world.room('charms', 'Класс чар', {floor:3,kind:'classroom',loreStatus:'GAME'});
  const corridor = world.room('corridor', 'Коридор', {floor:3,kind:'corridor',loreStatus:'GAME'});
  const library = world.room('library', 'Библиотека', {floor:3,kind:'library',loreStatus:'GAME'});
  world.connect(classroom,corridor);
  world.connect(corridor,library);
  const professor = world.character('teacher','Преподаватель чар',classroom);
  const lily = world.character('lily','Лили Эванс',classroom);
  const remus = world.character('remus','Ремус Люпин',library);
  const textbook = world.spellBook('lumos_primer',
    'Основы освещающих чар (учебный экземпляр)',library,'lumos');
  world.seedSpellKnowledge(professor,'lumos','independent');
  // A prototype teaching slot; 1970s placement is a GAME assumption.
  const unit=introductorySpellFor(1,'Charms');
  if(!unit)throw Error('Missing first-year prototype magic unit');
  const lesson = {id:'charms_intro',subject:'Чары',room:classroom,
    startsAt:510,endsAt:550,teacher:professor,spell:unit.spell};
  world.setTimetable(lily,[lesson],'lesson_first');
  world.setTimetable(remus,[lesson],'lesson_first');
  // The player-controlled pupil may choose the library over the class.
  world.setManualControl(remus,true);
  return {world,classroom,corridor,library,professor,lily,remus,textbook,lesson};
}
