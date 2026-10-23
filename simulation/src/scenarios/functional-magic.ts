import {createSimulation,type Simulation} from '../core/Simulation.ts';
import {vec} from '../core/magic-graph.ts';
/** [GAME] Four actual classroom lessons; nothing here claims a 1970s timetable. */
export function createFunctionalMagicSlice(world:Simulation=createSimulation()){
  const classroom=world.room('charms_lab','Класс чар',{floor:3,kind:'classroom',loreStatus:'GAME'});
  const corridor=world.room('corridor','Коридор',{floor:3,kind:'corridor',loreStatus:'GAME'});
  world.connect(classroom,corridor);
  const teacher=world.character('professor','Профессор чар',classroom);
  const pupil=world.character('pupil','Любознательный первокурсник',classroom);
  const spectator=world.character('spectator','Отсутствующий ученик',corridor);
  const feather=world.magicObject('feather','Перо',classroom,1,vec(0,0,0));
  const lessons=[
    {id:'formula',subject:'Charms',room:classroom,teacher,startsAt:540,endsAt:600,
      spell:'wingardium_leviosa' as const},
    {id:'hold',subject:'Charms laboratory',room:classroom,teacher,startsAt:600,endsAt:660,
      primitive:'position_lock' as const},
    {id:'force',subject:'Charms laboratory',room:classroom,teacher,startsAt:660,endsAt:720,
      primitive:'force_feedback' as const},
    {id:'light',subject:'Charms laboratory',room:classroom,teacher,startsAt:720,endsAt:780,
      primitive:'light_emission' as const}
  ];
  world.seedSpellKnowledge(teacher,'wingardium_leviosa','independent');
  world.setTimetable(pupil,lessons,'lesson_first');
  world.setTimetable(spectator,lessons,'lesson_first');
  world.setManualControl(spectator,true);
  return {world,classroom,teacher,pupil,spectator,feather,lessons};
}
