import test from 'node:test';
import assert from 'node:assert/strict';
import {createPersistentSimulation,restoreCheckpoint} from '../src/core/persistence.ts';
import {createSchoolWeek} from '../src/scenarios/school-week.ts';
import {installSchoolwideSocialPolicy} from '../src/scenarios/schoolwide-social.ts';

test('32.0: optional rollout covers eligible students/staff without overwriting timetables',()=>{
  const world=createPersistentSimulation();
  const scene=createSchoolWeek(world,'adaptive','autonomous',
    '12-pupils','expanded');
  const before=world.captureRuntime();
  const baseline=installSchoolwideSocialPolicy(scene,'baseline');
  assert.equal(baseline.enabled,0);
  assert.equal(baseline.roster,baseline.eligible+baseline.excluded.length);
  const full=installSchoolwideSocialPolicy(scene,'all-eligible');
  assert.equal(full.enabled,full.eligible);
  assert.ok(full.enabled>=12);
  assert.ok(full.excluded.some(s=>s.includes('Норрис')));
  const after=world.captureRuntime();
  assert.deepEqual(after.schedules,before.schedules);
  assert.deepEqual(after.locations,before.locations);
  assert.deepEqual(after.trusts,before.trusts);
  assert.deepEqual(after.commitments,before.commitments);
  assert.deepEqual(after.commitmentMemories,before.commitmentMemories);
  assert.deepEqual(after.dailyPlans.map(([id,p])=>id),
    before.dailyPlans.map(([id,p])=>id));
  const restored=restoreCheckpoint(world.checkpoint());
  assert.deepEqual(restored.captureRuntime(),world.captureRuntime());
});
