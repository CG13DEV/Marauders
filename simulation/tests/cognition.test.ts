import test from 'node:test';
import assert from 'node:assert/strict';
import { assessReports, decideInvestigation, type Trust } from '../src/core/cognition.ts';
import type { Belief } from '../src/core/beliefs.ts';

const report = (culprit: number, object: number, speaker: number): Belief => ({
  claim: { kind: 'broke_object', culprit, object },
  evidence: { kind: 'testimony', speaker, eventSequence: 1 }
});

test('empty evidence means unknown, even if an object is broken somewhere in the world', () => {
  assert.deepEqual(assessReports(90, [], () => 'trusted'), { status: 'unknown', object: 90 });
});

test('trust changes preference without erasing a conflicting statement', () => {
  const beliefs = [report(4, 90, 10), report(5, 90, 11)];
  const trust = (speaker: number): Trust => speaker === 10 ? 'trusted' : 'distrusted';
  assert.deepEqual(assessReports(90, beliefs, trust), {
    status: 'contested', object: 90,
    reports: [
      { culprit: 4, speakers: [{ id: 10, trust: 'trusted' }] },
      { culprit: 5, speakers: [{ id: 11, trust: 'distrusted' }] }
    ],
    favoredCulprit: 4
  });
});

test('equally rated witnesses provide no favored culprit', () => {
  const result = assessReports(90, [report(4, 90, 10), report(5, 90, 11)], () => 'trusted');
  assert.equal(result.status, 'contested');
  if (result.status === 'contested') assert.equal(result.favoredCulprit, null);
});

test('untrusted solitary rumor is only a report, not a chosen culprit', () => {
  const result = assessReports(90, [report(4, 90, 10)], () => 'distrusted');
  assert.equal(result.status, 'reported');
  if (result.status === 'reported') assert.equal(result.favoredCulprit, null);
});

test('repeated identical testimony from one speaker cannot amplify preference', () => {
  const result = assessReports(90, [
    report(4, 90, 10), report(4, 90, 10), report(5, 90, 11)
  ], () => 'neutral');
  assert.equal(result.status, 'contested');
  if (result.status === 'contested') {
    assert.equal(result.favoredCulprit, null);
    assert.equal(result.reports[0]?.speakers.length, 1);
  }
});

test('direct observation is distinguishable from third-party claims', () => {
  const result = assessReports(90, [
    report(5, 90, 11),
    { claim: { kind: 'broke_object', culprit: 4, object: 90 },
      evidence: { kind: 'vision', eventSequence: 2 } }
  ], () => 'trusted');
  assert.deepEqual(result, { status: 'witnessed', object: 90, culprit: 4 });
});

test('investigation chooses a local contested object, without peeking at the result', () => {
  const assessment = assessReports(90, [report(4, 90, 10), report(5, 90, 11)], () => 'neutral');
  assert.equal(decideInvestigation([assessment], [90], new Set(), true), 90);
  assert.equal(decideInvestigation([assessment], [], new Set(), true), null);
  assert.equal(decideInvestigation([assessment], [90], new Set([90]), true), null);
  assert.equal(decideInvestigation([assessment], [90], new Set(), false), null);
});
