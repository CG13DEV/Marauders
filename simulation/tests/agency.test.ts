import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrokenCupScenario } from '../src/scenarios/broken-cup.ts';

function giveRemusConflictingReports(breakCup = true) {
  const scene = createBrokenCupScenario();
  const { world, lily, james, peter, remus, classroom, door, cup } = scene;
  if (breakCup) {
    assert.equal(world.execute({ type: 'break_object', actor: james, target: cup }).ok, true);
  }
  assert.equal(world.execute({ type: 'open_door', actor: lily, door }).ok, true);
  assert.equal(world.execute({ type: 'move', actor: remus, destination: classroom }).ok, true);
  assert.equal(world.execute({ type: 'tell', actor: lily, listener: remus,
    claim: { kind: 'broke_object', culprit: james, object: cup } }).ok, true);
  assert.equal(world.execute({ type: 'tell', actor: james, listener: remus,
    claim: { kind: 'broke_object', culprit: peter, object: cup } }).ok, true);
  return scene;
}

test('source-specific trust favors a hypothesis but does not delete contradiction', () => {
  const { world, remus, lily, james, peter, cup } = giveRemusConflictingReports();
  world.setTrust(remus, lily, 'trusted');
  world.setTrust(remus, james, 'distrusted');
  const judgment = world.assessment(remus, cup);
  assert.equal(judgment.status, 'contested');
  if (judgment.status !== 'contested') return;
  assert.equal(judgment.favoredCulprit, james);
  assert.deepEqual(judgment.reports.map(x => x.culprit), [james, peter]);
  assert.equal(world.beliefs(remus).length, 2);
  assert.equal(world.trustOf(remus, lily), 'trusted');
  assert.equal(world.trustOf(lily, remus), 'neutral');
});

test('an inquisitive NPC inspects a visible object when evidence conflicts', () => {
  const { world, remus, lily, james, peter, cup } = giveRemusConflictingReports();
  world.setTrust(remus, lily, 'trusted');
  world.setTrust(remus, james, 'distrusted');
  world.setInquisitive(remus, true);
  const countBefore = world.events().length;
  const decisions = world.step();
  assert.equal(decisions.length, 1);
  assert.deepEqual(decisions[0]?.action, { type: 'inspect_object', actor: remus, target: cup });
  assert.equal(decisions[0]?.result.ok, true);
  assert.deepEqual(world.events()[countBefore], {
    type: 'object_inspected', actor: remus, target: cup, broken: true
  });
  assert.deepEqual(world.observations(remus).at(-1), {
    kind: 'inspected_object', source: 'vision', target: cup, broken: true
  });
  // Inspection can confirm brokenness, not identify the original actor.
  assert.equal(world.assessment(remus, cup).status, 'contested');
  assert.deepEqual(world.beliefs(remus).map(x => x.claim.culprit), [james, peter]);
  assert.deepEqual(world.step(), []); // no endless investigative loop
  assert.equal(world.events().length, countBefore + 1);
});

test('without an inquisitive trait there is no autonomous investigation', () => {
  const { world, remus, cup } = giveRemusConflictingReports();
  assert.deepEqual(world.step(), []);
  assert.equal(world.observations(remus).some(o => o.kind === 'inspected_object'), false);
  assert.equal(world.assessment(remus, cup).status, 'contested');
});

test('direct eyewitness does not investigate that event as a rumor', () => {
  const { world, lily, james, cup } = createBrokenCupScenario();
  world.setInquisitive(lily, true);
  world.execute({ type: 'break_object', actor: james, target: cup });
  assert.deepEqual(world.assessment(lily, cup), {
    status: 'witnessed', object: cup, culprit: james
  });
  assert.deepEqual(world.step(), []);
});

test('NPC has no knowledge of unseen cup state: conflicting rumors about intact cup trigger inspection', () => {
  const { world, remus, cup, james } = giveRemusConflictingReports(false);
  world.setInquisitive(remus, true);
  assert.deepEqual(world.step().map(d => d.action), [
    { type: 'inspect_object', actor: remus, target: cup }
  ]);
  assert.deepEqual(world.observations(remus).at(-1), {
    kind: 'inspected_object', source: 'vision', target: cup, broken: false
  });
  assert.deepEqual(world.events().filter(e => e.type === 'object_broken'), []);
  assert.notEqual(world.assessment(remus, cup).status, 'witnessed');
  assert.equal(world.assessment(remus, cup).status, 'contested');
  assert.equal(world.isBroken(cup), false);
  assert.notEqual(world.assessment(remus, cup).status, 'unknown');
});

test('inspection requires line of sight and the same room', () => {
  const scene = createBrokenCupScenario();
  const { world, remus, lily, cup, classroom } = scene;
  assert.deepEqual(world.execute({ type: 'inspect_object', actor: remus, target: cup }),
    { ok: false, reason: 'not_in_reach', events: [] });
  const blind = world.character('blind_witness', 'Слепой свидетель', classroom, { vision: false });
  assert.deepEqual(world.execute({ type: 'inspect_object', actor: blind, target: cup }),
    { ok: false, reason: 'cannot_see', events: [] });
  assert.deepEqual(world.execute({ type: 'inspect_object', actor: lily, target: classroom }),
    { ok: false, reason: 'not_inspectable', events: [] });
  assert.deepEqual(world.events(), []);
});

test('trust is a directional ECS relation, can change and does not leak between worlds', () => {
  const first = createBrokenCupScenario();
  const second = createBrokenCupScenario();
  first.world.setTrust(first.remus, first.lily, 'trusted');
  assert.equal(first.world.trustOf(first.remus, first.lily), 'trusted');
  first.world.setTrust(first.remus, first.lily, 'distrusted');
  assert.equal(first.world.trustOf(first.remus, first.lily), 'distrusted');
  first.world.setTrust(first.remus, first.lily, 'neutral');
  assert.equal(first.world.trustOf(first.remus, first.lily), 'neutral');
  assert.equal(second.world.trustOf(second.remus, second.lily), 'neutral');
  assert.throws(() => first.world.setTrust(first.remus, first.cup, 'trusted'));
});

test('an uninterested NPC does not become curious through another world', () => {
  const first = giveRemusConflictingReports();
  const second = giveRemusConflictingReports();
  first.world.setInquisitive(first.remus, true);
  assert.equal(first.world.step().length, 1);
  assert.deepEqual(second.world.step(), []);
});
