import test from 'node:test';
import assert from 'node:assert/strict';
import {createSchoolWeek} from '../src/scenarios/school-week.ts';
import {createSimulation} from '../src/core/Simulation.ts';
import {personalMagicResearchInitiative}
  from '../src/core/personal-magic-initiative.ts';
import {nextLocalMagicResearchAction} from '../src/core/autonomous-magic-research.ts';
import {createPersistentSimulation,serializeCheckpoint,restoreCheckpoint}
  from '../src/core/persistence.ts';

const week=()=>createSchoolWeek(undefined,'adaptive','off','control',
  'baseline','fixture-84','legacy','legacy','living-g4-5');

test('G4.5 science is an earned personal decision, not an assigned researcher flag',()=>{
  const w=week();
  const chars=w.students.filter(s=>s.year===1&&s.groupId===w.teachingGroups[0]?.id);
  assert.equal(chars.length,6);
  for(const student of chars){
    const p=w.world.captureRuntime().dailyPlans.find(([id])=>id===student.id)![1];
    assert.equal(p.magicalResearch,undefined);
    assert.ok(w.pupilSchedule.get(student.id)?.some(l=>l.spell==='wingardium_leviosa'));
    assert.equal(w.world.magicHypotheses(student.id).length,0);
    assert.deepEqual(w.world.visibleMagicObjects(student.id),[]);
  }
  const lesson=w.pupilSchedule.get(chars[0]!.id)!.find(l=>l.spell==='wingardium_leviosa')!;
  const plan=w.world.captureRuntime().dailyPlans.find(([id])=>id===chars[0]!.id)![1];
  const personal={...lesson,status:'on_time' as const,arrivedAt:lesson.startsAt};
  const criteria={plan,lessons:[personal],stage:'independent' as const,
    learned:['position_lock' as const],notes:[],pending:null,minute:3*1440+19*60+20};
  assert.equal(personalMagicResearchInitiative(criteria)?.room,lesson.room);
  assert.equal(personalMagicResearchInitiative({...criteria,
    lessons:[{...personal,status:'missed'}]}),null);
  assert.equal(personalMagicResearchInitiative({...criteria,
    stage:'unaware'}),null);
  assert.equal(personalMagicResearchInitiative({...criteria,
    learned:[]}),null);
  assert.equal(personalMagicResearchInitiative({...criteria,
    plan:{...plan,interest:'castle'}}),null);
  assert.equal(personalMagicResearchInitiative({...criteria,
    plan:{...plan,interest:'hobbies'}})?.preferred,'force_feedback');
});

test('G4.5 two distinct curious classmates independently discover and test magic',()=>{
  const w=week(),world=w.world;
  const cohort=w.students.filter(s=>s.groupId===w.teachingGroups[0]?.id);
  for(let i=0;i<1000;i++)world.step();
  const pupils=cohort.map(s=>{
    const plan=world.captureRuntime().dailyPlans.find(([id])=>id===s.id)![1];
    return {...s,interest:plan.interest,notes:world.magicHypotheses(s.id)};
  });
  const scientists=pupils.filter(s=>s.notes.some(n=>n.trials.length>=1));
  assert.ok(scientists.length>=2,
    JSON.stringify(pupils.map(s=>({key:s.key,interest:s.interest,
      stage:world.spellStage(s.id,'wingardium_leviosa'),
      primitive:world.knownMagicPrimitives(s.id),
      notes:s.notes.map(n=>({title:n.title,trials:n.trials.length})),
      active:world.activeMagicTrial(s.id)})),null,2));
  assert.ok(scientists.some(s=>s.interest==='lessons'));
  assert.ok(scientists.some(s=>s.interest==='hobbies'));
  assert.ok(pupils.filter(s=>s.interest==='castle').every(s=>s.notes.length===0));
  assert.ok(scientists.every(s=>s.notes.every(n=>
    n.spell==='wingardium_leviosa'&&!('originalStructureKnown' in n))));
  assert.ok(scientists.some(s=>s.notes[0]?.pattern.nodes.some(n=>
    n.kind==='levitate'&&n.controller==='force_feedback')));
  assert.ok(scientists.some(s=>s.notes[0]?.pattern.nodes.some(n=>
    n.kind==='levitate'&&n.controller==='position_lock')));
  for(const s of scientists){
    const records=world.attendance(s.id).filter(r=>r.id.startsWith('g44_charms'));
    assert.equal(records.length,3);
    assert.ok(records.every(r=>r.status==='on_time'||r.status==='late'));
  }
});

test('G4.5 authority guards shared objects in competing trials',()=>{
  const w=createSimulation();
  const room=w.room('room','Лаборатория');
  const a=w.character('a','Ученица',room);
  const b=w.character('b','Ученик',room);
  const object=w.magicObject('feather','Перо',room);
  for(const actor of [a,b]){
    w.seedSpellKnowledge(actor,'wingardium_leviosa','conceptual');
    w.seedMagicPrimitive(actor,'position_lock');
    const proposal=w.execute({type:'propose_magic_hypothesis',actor,
      spell:'wingardium_leviosa',title:'Удержание',
      pattern:{nodes:[{kind:'levitate',controller:'position_lock',
        trajectory:{kind:'hold',point:{x:0,y:2,z:0}}}]}});
    assert.equal(proposal.ok,true);
  }
  assert.equal(w.execute({type:'test_magic_hypothesis',
    actor:a,hypothesisId:1,object}).ok,true);
  assert.equal(w.visibleMagicObjects(b)[0]?.busy,true);
  assert.deepEqual(w.execute({type:'test_magic_hypothesis',
    actor:b,hypothesisId:1,object}),
    {ok:false,reason:'trial_already_running',events:[]});
  const aVisible=w.visibleMagicObjects(a);
  assert.equal(nextLocalMagicResearchAction({actor:b,spell:'wingardium_leviosa',
    minute:1000,known:['position_lock'],visible:aVisible,
    hypotheses:w.magicHypotheses(b),pending:null}),null);
});

test('G4.5 saved personally attended lesson remains the only basis for finding laboratory',()=>{
  const world=createPersistentSimulation();
  const w=createSchoolWeek(world,'adaptive','off','control',
    'baseline','fixture-84','legacy','legacy','living-g4-5');
  for(let i=0;i<400;i++)world.step();
  const saved=restoreCheckpoint(serializeCheckpoint(world));
  const scientist=w.students.find(s=>s.groupId===w.teachingGroups[0]?.id)!;
  const a=saved.id(scientist.key)!;
  const plan=saved.captureRuntime().dailyPlans.find(([id])=>id===a)![1];
  assert.equal(plan.magicalResearch,undefined);
  const lesson=saved.attendance(a).find(l=>l.spell==='wingardium_leviosa')!;
  assert.ok(lesson.arrivedAt!==undefined);
  assert.equal(saved.roomInfo(lesson.room)?.kind,'classroom');
  assert.deepEqual(saved.magicHypotheses(a),world.magicHypotheses(scientist.id));
});
