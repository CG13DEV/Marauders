import test from 'node:test';
import assert from 'node:assert/strict';
import {createSchoolWeek} from '../src/scenarios/school-week.ts';
import {createPersistentSimulation,restoreCheckpoint,serializeCheckpoint}
  from '../src/core/persistence.ts';
import {nextLocalMagicResearchAction} from '../src/core/autonomous-magic-research.ts';

function fixture(){
  const scene=createSchoolWeek(undefined,'adaptive','off','control',
    'baseline','fixture-84','legacy','legacy','living-g4-4');
  const learner=scene.students.find(s=>s.year===1&&
    s.house===scene.teachingGroups[0]?.houses[0])!;
  const teacher=scene.professors.find(t=>t.subject==='Charms')!;
  return {...scene,learner,teacher,
    feather:scene.world.id('g44_class_feather')!};
}
function advance(world:{step():unknown},n:number){for(let i=0;i<n;i++)world.step();}

test('G4.4 is an opt-in school timetable, teacher, prop and personally known lab',()=>{
  const f=fixture(),w=f.world;
  assert.ok(f.feather);
  const personal=w.captureRuntime().dailyPlans.find(([id])=>id===f.learner.id)![1];
  assert.deepEqual(personal.magicalResearch,
    {room:f.classrooms.Charms,spell:'wingardium_leviosa'});
  assert.ok(f.pupilSchedule.get(f.learner.id)?.some(l=>l.spell==='wingardium_leviosa'));
  assert.ok(f.pupilSchedule.get(f.learner.id)?.some(l=>l.primitive==='position_lock'));
  assert.ok(f.pupilSchedule.get(f.learner.id)?.some(l=>l.primitive==='force_feedback'));
  assert.equal(w.spellStage(f.teacher.id,'wingardium_leviosa'),'independent');
  assert.ok(w.knownMagicPrimitives(f.teacher.id).includes('force_feedback'));
  assert.deepEqual(w.visibleMagicObjects(f.learner.id),[]); // dormitory ≠ lab
  const bystander=f.students.find(s=>s.id!==f.learner.id)!;
  const bystanderPlan=w.captureRuntime().dailyPlans.find(([id])=>id===bystander.id)![1];
  assert.equal(bystanderPlan.magicalResearch,undefined);
  const original=createSchoolWeek();
  assert.equal(original.world.id('g44_class_feather'),undefined);
});

test('G4.4 school pupil learns, physically practises, then conducts autonomous trials',()=>{
  const f=fixture(),w=f.world;
  advance(w,590); // covers three afternoon laboratories plus repeat free hours
  assert.equal(w.spellStage(f.learner.id,'wingardium_leviosa'),'independent');
  assert.deepEqual(w.knownMagicPrimitives(f.learner.id),
    ['force_feedback','position_lock']);
  const notes=w.magicHypotheses(f.learner.id);
  assert.equal(notes.length,2,'two distinct personally reasoned controllers');
  assert.equal(notes[0]?.trials.length,1);
  assert.equal(notes[1]?.trials.length,1);
  assert.equal(notes[0]?.trials[0]?.object,f.feather);
  assert.equal(notes[1]?.trials[0]?.object,f.feather);
  const own=w.events().filter(e=>e.actor===f.learner.id);
  assert.ok(own.some(e=>e.type==='magic_trial_started'));
  assert.ok(own.filter(e=>e.type==='magic_trial_recorded').length>=2);
  assert.ok(own.some(e=>e.type==='spell_executed'&&e.spell==='wingardium_leviosa'&&e.mode==='guided'));
  assert.ok(own.some(e=>e.type==='spell_executed'&&e.spell==='wingardium_leviosa'&&e.mode==='independent'));
  assert.ok(own.some(e=>e.type==='entity_moved'&&e.to===f.classrooms.Charms));
  assert.equal('originalStructureKnown' in notes[0]!,false);
});

test('G4.4 personal policy cannot propose from unseen objects or unlearned theory',()=>{
  const action=nextLocalMagicResearchAction({
    actor:1,spell:'wingardium_leviosa',minute:1020,
    known:['position_lock'],visible:[],hypotheses:[],pending:null});
  assert.equal(action,null);
  const f=fixture();
  assert.equal(f.world.magicHypotheses(f.learner.id).length,0);
  assert.deepEqual(f.world.visibleMagicObjects(f.learner.id),[]);
  const peek=f.world.captureRuntime();
  assert.equal(peek.magicResearch?.length??0,0);
});

test('G4.4 checkpoint keeps personally known laboratory and real feather location',()=>{
  const persistent=createPersistentSimulation();
  const school=createSchoolWeek(persistent,'adaptive','off','control',
    'baseline','fixture-84','legacy','legacy','living-g4-4');
  const student=school.students.find(x=>x.year===1&&
    x.house===school.teachingGroups[0]?.houses[0])!;
  advance(persistent,57); // 17:30 after first workshop
  const restored=restoreCheckpoint(serializeCheckpoint(persistent));
  const actor=restored.id(student.key)!;
  const feather=restored.id('g44_class_feather')!;
  assert.ok(restored.magicState(feather));
  const plan=restored.captureRuntime().dailyPlans.find(([id])=>id===actor)![1];
  assert.equal(plan.magicalResearch?.room,restored.id('classroom_charms') ??
    school.classrooms.Charms);
  assert.equal(restored.spellStage(actor,'wingardium_leviosa'),
    persistent.spellStage(student.id,'wingardium_leviosa'));
});
