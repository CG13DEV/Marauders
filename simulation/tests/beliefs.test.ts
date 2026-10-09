import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrokenCupScenario } from '../src/scenarios/broken-cup.ts';

function meetRemus() {
  const scene = createBrokenCupScenario();
  const { world, james, remus, lily, cup, door, classroom } = scene;
  assert.equal(world.execute({ type: 'break_object', actor: james, target: cup }).ok, true);
  assert.deepEqual(world.beliefs(remus), []);
  assert.equal(world.execute({ type: 'open_door', actor: lily, door }).ok, true);
  assert.equal(world.execute({ type: 'move', actor: remus, destination: classroom }).ok, true);
  return scene;
}

test('Lily remembers a witnessed breakage as direct vision', () => {
  const { world, lily, james, cup } = createBrokenCupScenario();
  world.execute({ type: 'break_object', actor: james, target: cup });
  assert.deepEqual(world.beliefs(lily), [{
    claim: { kind: 'broke_object', culprit: james, object: cup },
    evidence: { kind: 'vision', eventSequence: 1 }
  }]);
});

test('Remus learns a fact from Lily as testimony, not as his own observation', () => {
  const { world, lily, remus, james, cup } = meetRemus();
  const result = world.execute({ type: 'tell', actor: lily, listener: remus,
    claim: { kind: 'broke_object', culprit: james, object: cup } });
  assert.equal(result.ok, true);
  assert.deepEqual(world.beliefs(remus), [{
    claim: { kind: 'broke_object', culprit: james, object: cup },
    evidence: { kind: 'testimony', speaker: lily, eventSequence: 4,
      origin:{kind:'vision'} }
  }]);
  assert.deepEqual(world.observations(remus), [{ kind: 'heard_crash', source: 'hearing' }]);
});

test('a false statement produces a reported belief without changing world truth', () => {
  const { world, lily, remus, james, peter, cup } = meetRemus();
  const lie = { kind: 'broke_object' as const, culprit: peter, object: cup };
  assert.equal(world.execute({ type: 'tell', actor: lily, listener: remus, claim: lie }).ok, true);
  assert.deepEqual(world.beliefs(remus)[0]?.claim, lie);
  assert.equal(world.beliefs(remus)[0]?.evidence.kind, 'testimony');
  const actual = world.events().find(e => e.type === 'object_broken');
  assert.deepEqual(actual, { type: 'object_broken', actor: james, target: cup, room: world.currentRoom(james) });
  assert.deepEqual(world.beliefs(lily)[0]?.claim, { kind: 'broke_object', culprit: james, object: cup });
});

test('contradictory testimony is retained with distinct attributed speakers', () => {
  const { world, lily, remus, james, peter, cup } = meetRemus();
  world.execute({ type: 'tell', actor: lily, listener: remus,
    claim: { kind: 'broke_object', culprit: james, object: cup } });
  world.execute({ type: 'tell', actor: james, listener: remus,
    claim: { kind: 'broke_object', culprit: peter, object: cup } });
  const beliefs = world.beliefs(remus);
  assert.equal(beliefs.length, 2);
  assert.deepEqual(beliefs.map(b => b.claim.culprit), [james, peter]);
  assert.deepEqual(beliefs.map(b => b.evidence.kind === 'testimony' ? b.evidence.speaker : null), [lily, james]);
  assert.deepEqual(beliefs.map(b => b.evidence.eventSequence), [4, 5]);
});

test('no conversation through a closed door', () => {
  const { world, lily, remus, james, cup } = createBrokenCupScenario();
  world.execute({ type: 'break_object', actor: james, target: cup });
  const count = world.events().length;
  assert.deepEqual(world.execute({ type: 'tell', actor: lily, listener: remus,
    claim: { kind: 'broke_object', culprit: james, object: cup } }),
    { ok: false, reason: 'not_colocated', events: [] });
  assert.deepEqual(world.beliefs(remus), []);
  assert.equal(world.events().length, count);
});

test('listener must hear; self-testimony and inanimate speakers are rejected', () => {
  const { world, lily, james, cup, classroom } = createBrokenCupScenario();
  const deaf = world.character('deaf', 'Ученик без слуха', classroom, { hearing: false });
  const claim = { kind: 'broke_object' as const, culprit: james, object: cup };
  assert.deepEqual(world.execute({ type: 'tell', actor: lily, listener: deaf, claim }),
    { ok: false, reason: 'listener_cannot_hear', events: [] });
  assert.deepEqual(world.execute({ type: 'tell', actor: lily, listener: lily, claim }),
    { ok: false, reason: 'cannot_talk_to_self', events: [] });
  assert.deepEqual(world.execute({ type: 'tell', actor: cup, listener: lily, claim }),
    { ok: false, reason: 'not_character', events: [] });
  assert.deepEqual(world.beliefs(deaf), []);
});

test('invalid claim references are rejected without changing recipient knowledge', () => {
  const { world, lily, james, classroom, cup } = createBrokenCupScenario();
  assert.deepEqual(world.execute({ type: 'tell', actor: lily, listener: james,
    claim: { kind: 'broke_object', culprit: classroom, object: cup } }),
    { ok: false, reason: 'invalid_claim', events: [] });
  assert.deepEqual(world.beliefs(james), []);
});

test('opening door requires proximity and is rejected when already open', () => {
  const { world, lily, peter, door } = createBrokenCupScenario();
  assert.deepEqual(world.execute({ type: 'open_door', actor: peter, door }),
    { ok: false, reason: 'not_near_door', events: [] });
  assert.equal(world.doorIsOpen(door), false);
  assert.equal(world.execute({ type: 'open_door', actor: lily, door }).ok, true);
  assert.deepEqual(world.execute({ type: 'open_door', actor: lily, door }),
    { ok: false, reason: 'already_open', events: [] });
});

test('memory and event snapshots are defensive and command objects cannot mutate them', () => {
  const { world, lily, remus, james, cup } = meetRemus();
  const claim = { kind: 'broke_object' as const, culprit: james, object: cup };
  const result = world.execute({ type: 'tell', actor: lily, listener: remus, claim });
  claim.culprit = remus;
  const records = world.beliefs(remus);
  records[0]!.claim.culprit = remus;
  records.length = 0;
  const publicEvent = world.events().find(e => e.type === 'testimony_delivered');
  if (publicEvent?.type === 'testimony_delivered') publicEvent.claim.culprit = remus;
  const commandEvent = result.events.find(e => e.type === 'testimony_delivered');
  if (commandEvent?.type === 'testimony_delivered') commandEvent.claim.culprit = remus;
  assert.equal(world.beliefs(remus)[0]?.claim.culprit, james);
  const internalEvent = world.events().find(e => e.type === 'testimony_delivered');
  assert.equal(internalEvent?.type === 'testimony_delivered' && internalEvent.claim.culprit, james);
});

test('world instances cannot leak beliefs between simulations', () => {
  const first = meetRemus();
  const second = createBrokenCupScenario();
  first.world.execute({ type: 'tell', actor: first.lily, listener: first.remus,
    claim: { kind: 'broke_object', culprit: first.james, object: first.cup } });
  assert.deepEqual(second.world.beliefs(second.remus), []);
  assert.deepEqual(second.world.beliefs(second.lily), []);
  assert.deepEqual(second.world.events(), []);
});
