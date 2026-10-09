/** [GAME] #31.6: print bounded autonomous social traces, not scripted plots. */
import assert from 'node:assert/strict';
import {runOpenSocialWorld} from '../scenarios/open-social-life.ts';
const mutual=runOpenSocialWorld('mutual');
const reserved=runOpenSocialWorld('reserved_reply');
const disabled=runOpenSocialWorld('no_invitations');
assert.ok(mutual.summary.chats>0);
assert.ok(mutual.summary.offers>0);
assert.ok(reserved.summary.declined>0);
assert.equal(disabled.summary.offers,0);
for(const world of [mutual,reserved,disabled])
  assert.equal(world.checkpoint.sameRuntime,true);
console.log(JSON.stringify({
  experiment:'31.6',classification:'[GAME]',
  control:'Four residents; three calendar days; no injected actions after initial plan configuration',
  forks:[mutual,reserved,disabled].map(world=>({
    variant:world.variant,initial:world.initial,summary:world.summary,
    checkpoint:world.checkpoint,
    keyEvents:world.events.slice(0,30),
    choiceTrace:world.trace.filter(row=>row.action==='chat'||
      row.action==='offer_meeting'||row.action==='answer_meeting').slice(0,25)
  })),
  limitations:['Avatar policies are GAME, not canonical personality.',
    'Trace records personal evidence and actual decisions, not internal subjective thoughts.',
    'No completed reconciliation is claimed without personally witnessed kept meetings.',
    'Short population demo does not establish global emergent narrative quality.']
},null,2));
