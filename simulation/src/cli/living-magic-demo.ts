import {createSchoolWeek} from '../scenarios/school-week.ts';

const scene=createSchoolWeek(undefined,'adaptive','off','control',
  'baseline','fixture-84','legacy','legacy','living-g4-4');
const pupil=scene.students.find(s=>s.year===1&&s.house===scene.teachingGroups[0]?.houses[0])!;
const {world}=scene;
for(let t=0;t<1000;t++)world.step();
const notes=world.magicHypotheses(pupil.id);
console.log('Учебная неделя:',scene.sessions.filter(s=>s.id.startsWith('g44_')));
console.log('Ученик:',world.label(pupil.id));
console.log('Wingardium Leviosa:',world.spellStage(pupil.id,'wingardium_leviosa'));
console.log('Изученные принципы:',world.knownMagicPrimitives(pupil.id));
console.log('Личные гипотезы:',notes.map(h=>({title:h.title,trials:h.trials.length,
  after:h.trials[0]?.after})));
console.log('Физические исследования:',world.events().filter(e=>
  e.actor===pupil.id&&(e.type==='magic_trial_recorded'||e.type==='magic_trial_started')).length);
