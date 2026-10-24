import {createSchoolWeek} from '../scenarios/school-week.ts';
const school=createSchoolWeek(undefined,'adaptive','off','control',
  'baseline','fixture-84','legacy','legacy','living-g4-5');
const cohort=school.students.filter(s=>s.groupId===school.teachingGroups[0]?.id);
for(let i=0;i<1000;i++)school.world.step();
console.log('[G4.5] Общая неделя:',cohort.length,'учеников');
for(const s of cohort){
  const plan=school.world.captureRuntime().dailyPlans.find(([id])=>id===s.id)![1];
  const notes=school.world.magicHypotheses(s.id);
  console.log(s.key,plan.interest,'изучено:',school.world.knownMagicPrimitives(s.id),
    'гипотезы:',notes.map(h=>({name:h.title,trials:h.trials.length})));
}
console.log('Всего опытов:',cohort.reduce((n,s)=>
  n+school.world.magicHypotheses(s.id).reduce((v,h)=>v+h.trials.length,0),0));
