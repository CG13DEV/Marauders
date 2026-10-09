import test from 'node:test';
import assert from 'node:assert/strict';
import {runOpenSocialWorld} from '../src/scenarios/open-social-life.ts';
test('31.6 autonomous multiday social events',()=>{
  const x=runOpenSocialWorld('mutual');
  assert.ok(x.summary.chats>0);
  assert.ok(x.summary.offers>0);
  assert.equal(x.checkpoint.sameRuntime,true);
});
test('31.6 no invitation capability means no meetings',()=>{
  const x=runOpenSocialWorld('no_invitations');
  assert.ok(x.summary.chats>0);
  assert.equal(x.summary.offers,0);
  assert.equal(x.summary.kept,0);
  assert.equal(x.checkpoint.sameRuntime,true);
});
test('31.6 receiver preferences affect the invitations they accept',()=>{
  const a=runOpenSocialWorld('mutual');
  const b=runOpenSocialWorld('reserved_reply');
  assert.ok(b.summary.declined>0);
  assert.ok(a.summary.accepted>=b.summary.accepted);
  assert.equal(a.summary.harms,0);
  assert.equal(b.summary.harms,0);
});
test('31.6 same initial conditions reproduce social history and decisions',()=>{
  assert.deepEqual(runOpenSocialWorld('mutual'),
    runOpenSocialWorld('mutual'));
});
