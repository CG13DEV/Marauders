import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/Simulation.ts';
import { createPersistentSimulation,restoreCheckpoint,restoreSimulation } from '../src/core/persistence.ts';
import { createSchoolWeek,INTENTION_ROLLOUT_STAGES,rolloutPopulation } from '../src/scenarios/school-week.ts';
import { auditIntentionRollout } from '../src/scenarios/intention-rollout.ts';

test('cohort gates activate 0/12/24/84 pupils and eventually all 12 professors',()=>{
  assert.deepEqual(INTENTION_ROLLOUT_STAGES,
    ['control','12-pupils','24-pupils','84-pupils','96-all']);
  assert.deepEqual(INTENTION_ROLLOUT_STAGES.map(rolloutPopulation),[
    {pupils:0,teachers:0},{pupils:12,teachers:0},{pupils:24,teachers:0},
    {pupils:84,teachers:0},{pupils:84,teachers:12}
  ]);
  for(const stage of INTENTION_ROLLOUT_STAGES){
    const world=createSimulation(),scene=createSchoolWeek(world,'adaptive','autonomous',stage);
    const on=scene.students.filter(s=>world.needsOf(s.id)!==null);
    const staff=scene.professors.filter(p=>world.needsOf(p.id)!==null);
    assert.equal(on.length,rolloutPopulation(stage).pupils);
    assert.equal(staff.length,rolloutPopulation(stage).teachers);
    assert.ok(on.every(s=>s.year<=Math.max(1,rolloutPopulation(stage).pupils/12)));
    assert.ok(scene.students.filter(s=>!on.includes(s)).every(s=>world.needsOf(s.id)===null));
  }
});

test('a full week with first 12 pupils keeps physical movement and timetable invariants',()=>{
  const world=createSimulation(),scene=createSchoolWeek(world,'adaptive','autonomous','12-pupils');
  for(let i=0;i<1008;i++)world.step();
  const result=auditIntentionRollout(scene);
  assert.deepEqual(result.opted,{pupils:12,teachers:0});
  assert.deepEqual(result.invariants,{ok:true,errors:[]});
  assert.equal(result.attendance.pending,0);
  assert.equal(result.pupils,84);
  assert.equal(result.professors,12);
  assert.ok(result.meals.pupils>0);
  assert.ok(result.rest.pupils>0);
  assert.ok(result.body!==null);
});

test('entire 96-person population runs one week without impossible movement',()=>{
  const world=createSimulation(),scene=createSchoolWeek(world,'adaptive','autonomous','96-all');
  for(let i=0;i<1008;i++)world.step();
  const result=auditIntentionRollout(scene);
  assert.deepEqual(result.opted,{pupils:84,teachers:12});
  assert.deepEqual(result.invariants,{ok:true,errors:[]});
  assert.equal(result.attendance.pending,0);
  assert.ok(result.body!==null);
  assert.ok(result.movementActions>0);
  assert.equal(result.tutoring,
    world.events().filter(e=>e.type==='tutoring_appointment_completed').length);
});

test('staged school checkpoints and journal resume identical individual bodily and social state',()=>{
  const world=createPersistentSimulation();
  const scene=createSchoolWeek(world,'adaptive','autonomous','12-pupils');
  for(let i=0;i<86;i++)world.step();
  const checkpoint=restoreCheckpoint(world.checkpoint());
  const journal=restoreSimulation(world.snapshot());
  assert.deepEqual(checkpoint.captureRuntime(),world.captureRuntime());
  assert.deepEqual(journal.captureRuntime(),world.captureRuntime());
  for(let i=0;i<18;i++){world.step();checkpoint.step();journal.step();}
  assert.deepEqual(checkpoint.captureRuntime(),world.captureRuntime());
  assert.deepEqual(journal.captureRuntime(),world.captureRuntime());
  for(const pupil of scene.students.slice(0,12)){
    const key=pupil.key;
    assert.deepEqual(checkpoint.needsOf(checkpoint.id(key)!),
      world.needsOf(pupil.id));
    assert.deepEqual(checkpoint.intentionHistory(checkpoint.id(key)!),
      world.intentionHistory(pupil.id));
  }
});

test('control stage preserves experiment 19 exact week baseline',()=>{
  const world=createSimulation(),scene=createSchoolWeek(world);
  for(let i=0;i<1008;i++)world.step();
  const result=auditIntentionRollout(scene);
  assert.deepEqual(result.opted,{pupils:0,teachers:0});
  assert.equal(result.attendance.on_time,684);
  assert.equal(result.attendance.late,66);
  assert.equal(result.attendance.missed,0);
  assert.equal(result.lumos,12);
  assert.equal(result.social.invitations,56);
  assert.equal(result.social.fulfilled,44);
  assert.deepEqual(result.invariants,{ok:true,errors:[]});
});
