/** [GAME] Experiment #31.7: school duty vs personal promise, no scripted betrayal. */
import assert from 'node:assert/strict';
import {runOpenSocialWorld} from '../scenarios/open-social-life.ts';
const school=runOpenSocialWorld('lesson_first');
const promise=runOpenSocialWorld('promise_first');
const baseline=runOpenSocialWorld('mutual');
const state=(x:typeof school)=>x.conflictSnapshots.find(e=>e.minute===2640)!;
assert.equal(state(school).firstMeetingStatus,'expired');
assert.equal(state(school).siriusOutcome,'waited_alone');
assert.equal(state(school).jamesOutcome,null);
assert.equal(state(promise).firstMeetingStatus,'kept');
assert.equal(state(baseline).firstMeetingStatus,'kept');
assert.equal(school.checkpoint.sameRuntime,true);
assert.equal(promise.checkpoint.sameRuntime,true);
console.log(JSON.stringify({
  experiment:'31.7',
  classification:'[GAME]',
  constraint:'Pre-existing evening school duty, never a scripted move or missed meeting',
  variants:[school,promise,baseline].map(x=>({
    name:x.variant,
    personalExperience:x.conflictSnapshots,
    summary:x.summary,
    checkpoint:x.checkpoint,
    observedActions:x.trace.filter(t=>t.day===1&&
      ['move','offer_meeting','answer_meeting','chat'].includes(t.action)).slice(0,16),
    authoritativeMeetings:x.events.filter(e=>e.type==='meeting_resolved')
  })),
  limitation:'Neither an apology nor reconciliation is invented from a single conversation.'
},null,2));
