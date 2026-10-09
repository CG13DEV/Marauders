import test from 'node:test';
import assert from 'node:assert/strict';
import {runSocialChoiceFork} from '../src/scenarios/social-choice-counterfactual.ts';
test('31.4 base social choice',()=>{
  const x=runSocialChoiceFork({experience:'waited',friendTrust:'neutral',companionPresent:true});
  assert.deepEqual(x.outcome.chattedWith,['companion']);
});

test('31.4 trusted friend gets a conversation',()=>{
  const x=runSocialChoiceFork({experience:'waited',friendTrust:'trusted',companionPresent:true});
  assert.deepEqual(x.outcome.chattedWith,['friend']);
  assert.equal(x.outcome.successfulMeetingRemembered,false);
  assert.equal(x.outcome.harmfulIncidents,0);
});
test('31.4 solitude and a missed promise motivate physical departure',()=>{
  const x=runSocialChoiceFork({experience:'waited',friendTrust:'neutral',companionPresent:false});
  assert.equal(x.outcome.leftGallery,true);
  assert.equal(x.decisions[0]?.type,'move');
  assert.equal(x.decisions[0]?.destination,'corridor');
  assert.equal(x.decisions[0]?.ok,true);
});
test('31.4 kept promise with the same future opportunity favors contact',()=>{
  const input={friendTrust:'neutral' as const,companionPresent:false};
  const a=runSocialChoiceFork({...input,experience:'kept'});
  const b=runSocialChoiceFork({...input,experience:'waited'});
  assert.deepEqual([a.opportunity.minute,a.opportunity.friendPresent,
    a.opportunity.companionPresent,a.opportunity.pupilRoom],
    [b.opportunity.minute,b.opportunity.friendPresent,
    b.opportunity.companionPresent,b.opportunity.pupilRoom]);
  assert.equal(a.outcome.successfulMeetingRemembered,true);
  assert.deepEqual(a.outcome.chattedWith,['friend']);
  assert.equal(b.outcome.leftGallery,true);
});
