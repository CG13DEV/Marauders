import test from 'node:test';
import assert from 'node:assert/strict';
import {runControlledSpellComparison}
  from '../src/scenarios/controlled-spell-comparison.ts';

test('#80: same physical initial conditions compare named Wingardium with two alternatives',()=>{
  const r=runControlledSpellComparison();
  assert.equal(r.observations.length,3);
  assert.deepEqual(r.observations.map(x=>x.kind),
    ['formula','position_lock','force_feedback']);
  assert.ok(r.observations.every(x=>x.trial.startMinute===480&&
    x.trial.observedMinute===500));
  assert.deepEqual(r.observations[0]!.trial.before,
    r.observations[2]!.trial.before);
  assert.equal(r.comparisons.lock.sameObservedPosition,true);
  assert.equal(r.comparisons.feedback.sameObservedPosition,false);
  assert.ok(r.comparisons.feedback.observationDistance>0.01);
  assert.equal(r.events.filter(x=>x.type==='magic_pattern_cast').length,3);
  assert.equal(r.events.filter(x=>x.type==='magic_object_disturbed').length,3);
  assert.equal(Object.hasOwn(r,'originalPattern'),false);
  assert.equal(Object.hasOwn(r,'correctHypothesis'),false);
});
