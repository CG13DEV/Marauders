import {createSimulation,type Simulation} from '../core/Simulation.ts';
import {introductorySpellFor} from './curriculum.ts';

/**
 * [GAME] G4.1 intentionally begins with a pupil who misses a lesson.
 * After the absence, no player issues a study, move, tutor or cast command.
 * The school timetable, personal gap, known library and local book cover
 * are sufficient for the existing intention + world action pipeline.
 */
export function createAutonomousAcademicMagicSlice(
  options: {bookTitle?:string;knowsLibrary?:boolean;world?:Simulation} = {}
) {
  const world=options.world??createSimulation();
  const classroom=world.room('charms','Класс чар',{floor:3,kind:'classroom',loreStatus:'GAME'});
  const corridor=world.room('corridor','Коридор',{floor:3,kind:'corridor',loreStatus:'GAME'});
  const library=world.room('library','Библиотека',{floor:3,kind:'library',loreStatus:'GAME'});
  const dorm=world.room('dorm','Спальня Гриффиндора',{floor:3,kind:'dormitory',loreStatus:'GAME'});
  world.connect(classroom,corridor);
  world.connect(corridor,library);
  world.connect(corridor,dorm);
  const professor=world.character('professor','Профессор чар',classroom);
  const lily=world.character('lily','Лили Эванс',classroom);
  const remus=world.character('remus','Ремус Люпин',dorm);
  const book=world.spellBook('lumos_manual',
    options.bookTitle??'Lumos — учебник по освещающим чарам',library,'lumos');
  world.seedSpellKnowledge(professor,'lumos','independent');
  world.setHelpful(professor,true);
  const unit=introductorySpellFor(1,'Charms');
  if(!unit)throw Error('Missing G4.1 introductory study unit');
  const lesson={id:'charms_lumos',subject:'Чары',room:classroom,
    startsAt:510,endsAt:550,teacher:professor,spell:unit.spell};
  for(const actor of [professor,lily,remus])
    world.setTimetable(actor,[lesson],'lesson_first');
  world.setDailyLife(remus,{
    homeRoom:dorm,diningRoom:dorm,socialRoom:dorm,
    leisureRoom:library,
    ...(options.knowsLibrary===false?{}:{libraryRoom:library}),
    style:'reserved',interest:'lessons',
    learningAppointments:true,intentionPlanning:true,schoolPlanning:'adaptive'
  });
  world.setHelpSeeking(remus,true);
  world.setExperimenter(remus,true);
  // Represent an *actual* missed class in a controlled fixture. The learner
  // becomes autonomous after the lesson; everything thereafter is systemic.
  world.setManualControl(remus,true);
  return {world,classroom,corridor,library,dorm,professor,lily,remus,book,lesson,
    releaseAfterMissedLesson(){
      if(world.clock().absoluteMinute<lesson.endsAt ||
         world.attendance(remus)[0]?.status!=='missed')
        throw Error('Cannot release before class is genuinely missed');
      world.setManualControl(remus,false);
      // Professor follows a genuine world route to offer nearby practice later.
      world.setRoutine(professor,[library]);
    }
  };
}
