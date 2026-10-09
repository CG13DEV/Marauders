import test from 'node:test';
import assert from 'node:assert/strict';
import {runSocialChoiceFork} from '../src/scenarios/social-choice-counterfactual.ts';
test('31.4 base social choice',()=>{
  const x=runSocialChoiceFork({experience:'waited',friendTrust:'neutral',companionPresent:true});
  assert.deepEqual(x.outcome.chattedWith,['companion']);
});
