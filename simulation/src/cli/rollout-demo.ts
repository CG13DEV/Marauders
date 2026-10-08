import { createSimulation } from '../core/Simulation.ts';
import { createSchoolWeek, INTENTION_ROLLOUT_STAGES } from '../scenarios/school-week.ts';
import { auditIntentionRollout } from '../scenarios/intention-rollout.ts';

console.log('Experiment #20 / Whole Hogwarts opt-in rollout');
for(const stage of INTENTION_ROLLOUT_STAGES){
  const world=createSimulation();
  const scene=createSchoolWeek(world,'adaptive','autonomous',stage);
  for(let tick=0;tick<1008;tick++)world.step();
  const report=auditIntentionRollout(scene);
  console.log('population:',JSON.stringify(report));
  if(!report.invariants.ok)throw new Error(
    'Rollout invalid '+stage+': '+report.invariants.errors.join(', '));
}

/** Separate controlled challenge: personal plans deliberately compete with
 * normal 96-person school life. It is NOT an organically formed goal rate. */
const challengeWorld=createSimulation();
const challengeScene=createSchoolWeek(challengeWorld,'adaptive','autonomous','96-all');
let injected=0;
for(const pupil of challengeScene.students.slice(0,24)){
  const made=challengeWorld.execute({
    type:'intend_visit',actor:pupil.id,destination:challengeScene.hospital,
    importance:'important',deadlineMinute:600
  });
  if(!made.ok)throw new Error('Could not create controlled personal objective');
  injected++;
}
for(let i=0;i<1008;i++)challengeWorld.step();
const challenged=auditIntentionRollout(challengeScene);
console.log('challenge:',JSON.stringify({
  injected,goals:challenged.goals,
  attendance:challenged.attendance,social:challenged.social,
  meals:challenged.meals,body:challenged.body,
  invariants:challenged.invariants
}));
if(!challenged.invariants.ok)throw new Error('Challenge violates school invariants');
