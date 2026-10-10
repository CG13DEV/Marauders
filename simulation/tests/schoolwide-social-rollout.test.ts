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

test('32.0 regression: an openly considered repair survives distrust from neutral baseline',()=>{
  function run(response:'open'|'guarded'){
    const world=createPersistentSimulation();
    const common=world.room('common','Common');
    const library=world.room('library','Library');
    world.connect(common,library);
    const actor=world.character('actor','Absent actor',common);
    const witness=world.character('witness','Waiting pupil',common);
    world.setManualControl(actor,true);
    world.setDailyLife(witness,{
      homeRoom:library,diningRoom:library,socialRoom:library,
      style:'outgoing',interest:'castle',socialInvitations:true,
      relationshipLearning:true,contextualRelationships:true,
      repairResponse:response
    });
    const initial=world.execute({type:'promise_meeting',
      actor,listener:witness,room:library,atMinute:540,purpose:'explore'});
    assert.equal(initial.ok,true);
    for(let i=0;i<9;i++)world.step();
    assert.equal(world.meetingLedger()[0]?.status,'expired');
    assert.equal(world.promiseHistory(witness).at(-1)?.kind,'waited_alone');
    assert.equal(world.trustForPurpose(witness,actor,'explore'),'distrusted');
    assert.equal(world.execute({type:'move',actor,destination:library}).ok,true);
    const offer=world.execute({type:'offer_meeting',
      actor,listener:witness,room:library,atMinute:700,
      purpose:'explore',repairOfMeetingId:1});
    assert.equal(offer.ok,true);
    const decisions=world.step().filter(x=>
      x.actor===witness&&x.action.type==='answer_meeting');
    assert.equal(decisions.length,1);
    assert.equal(decisions[0]?.result.ok,true);
    return {world,actor,witness,reply:world.meetingLedger()[1]?.status};
  }
  const open=run('open');
  const guarded=run('guarded');
  assert.equal(open.reply,'pending',
    'A concrete firsthand repair can be accepted even if reliability is distrusted');
  assert.equal(guarded.reply,'declined',
    'A guarded character remains free to refuse the same offer');
  assert.equal(open.world.trustForPurpose(open.witness,open.actor,'explore'),'distrusted',
    'Acceptance must not magically repair trust before a real meeting');
  for(let i=0;i<13;i++)open.world.step();
  assert.equal(open.world.meetingLedger()[1]?.status,'kept');
  assert.equal(open.world.trustForPurpose(open.witness,open.actor,'explore'),'neutral');
  assert.equal(guarded.world.trustForPurpose(guarded.witness,guarded.actor,'explore'),
    'distrusted');
});
