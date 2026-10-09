import test from 'node:test';
import assert from 'node:assert/strict';
import {runOpenSocialWorld} from '../src/scenarios/open-social-life.ts';
test('31.6 autonomous multiday social events',()=>{
  const x=runOpenSocialWorld('mutual');
  assert.ok(x.summary.chats>0);
  assert.ok(x.summary.offers>0);
  assert.equal(x.checkpoint.sameRuntime,true);
});
