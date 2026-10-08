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
