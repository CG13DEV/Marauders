import test from 'node:test';
import assert from 'node:assert/strict';
import {runOpenSocialWorld} from '../src/scenarios/open-social-life.ts';

test('31.7: real lesson duty breaks an autonomous promise, only the waiter remembers',()=>{
  const conflict=runOpenSocialWorld('lesson_first');
  const atExpiry=conflict.conflictSnapshots.find(x=>x.minute===2640);
  assert.ok(atExpiry);
  assert.equal(atExpiry.firstMeetingStatus,'expired');
  assert.equal(atExpiry.jamesRoom,'library');
  assert.equal(atExpiry.siriusRoom,'common');
  assert.equal(atExpiry.lessonStatus,'on_time');
  assert.equal(atExpiry.siriusOutcome,'waited_alone');
  assert.equal(atExpiry.jamesOutcome,null);
  assert.equal(atExpiry.siriusTrust,'neutral');
  assert.equal(atExpiry.jamesTrust,'trusted');
  assert.ok(conflict.summary.expired>=1);
  assert.ok(conflict.events.some(x=>x.type==='meeting_resolved'&&x.outcome==='expired'));
  assert.equal(conflict.checkpoint.sameRuntime,true);
  assert.equal(conflict.checkpoint.sameRelationships,true);
});

test('31.7: same competing lesson with a different obligation priority fulfills promise',()=>{
  const obligation=runOpenSocialWorld('promise_first');
  const school=runOpenSocialWorld('lesson_first');
  const kept=obligation.conflictSnapshots.find(x=>x.minute===2640);
  const missed=school.conflictSnapshots.find(x=>x.minute===2640);
  assert.ok(kept&&missed);
  assert.equal(kept.firstMeetingStatus,'kept');
  assert.equal(kept.siriusOutcome,'met');
  assert.equal(kept.siriusTrust,'trusted');
  assert.equal(kept.jamesTrust,'trusted');
  assert.equal(missed.firstMeetingStatus,'expired');
  assert.equal(missed.siriusTrust,'neutral');
  assert.deepEqual(school.initial,obligation.initial);
  assert.equal(obligation.checkpoint.sameRuntime,true);
});

test('31.7: an unconstrained world keeps the same original invitation',()=>{
  const baseline=runOpenSocialWorld('mutual');
  assert.equal(baseline.conflictSnapshots[0]?.firstMeetingStatus,'kept');
  assert.equal(baseline.conflictSnapshots[0]?.siriusOutcome,'met');
  assert.equal(baseline.conflictSnapshots[0]?.siriusTrust,'trusted');
  assert.equal(baseline.summary.expired,0);
});

test('31.7: days of competing obligations replay deterministically',()=>{
  for(const variant of ['lesson_first','promise_first'] as const)
    assert.deepEqual(runOpenSocialWorld(variant),runOpenSocialWorld(variant));
});
