import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrokenCupScenario } from '../src/scenarios/broken-cup.ts';

function livingSchool() {
  const scene = createBrokenCupScenario();
  const { world, lily, james, remus, peter, corridor, library, classroom, cup, door } = scene;
  // An actual route; the agent does NOT know where Lily will go.
  world.connect(corridor, library);
  const apply = (command: Parameters<typeof world.execute>[0]) => {
    const result = world.execute(command);
    assert.equal(result.ok, true, JSON.stringify(result));
  };
  apply({ type: 'break_object', actor: james, target: cup });
  apply({ type: 'open_door', actor: lily, door });
  apply({ type: 'move', actor: remus, destination: classroom });
  apply({ type: 'tell', actor: lily, listener: remus,
    claim: { kind: 'broke_object', culprit: james, object: cup } });
  apply({ type: 'tell', actor: james, listener: remus,
    claim: { kind: 'broke_object', culprit: peter, object: cup } });
  world.setTrust(remus, lily, 'trusted');
  world.setTrust(remus, james, 'distrusted');
  world.setGuarded(james, true);
  world.setInquisitive(remus, true);
  world.setSocialInvestigator(remus, true);
  return { ...scene, apply };
}

test('one social action per tick: inspect, question guarded suspect, search rooms, question Lily', () => {
  const { world, apply, lily, james, remus, cup, corridor, library } = livingSchool();
  apply({ type: 'move', actor: lily, destination: corridor });
  apply({ type: 'move', actor: lily, destination: library });

  const first = world.step();
  assert.deepEqual(first.map(d => d.action), [{ type: 'inspect_object', actor: remus, target: cup }]);
  const second = world.step();
  assert.deepEqual(second.map(d => d.action), [{ type: 'ask_about', actor: remus, listener: james, object: cup }]);
  assert.deepEqual(second[0]?.result.events, [
    { type: 'question_asked', actor: remus, listener: james, object: cup, answered: false }
  ]);
  assert.equal(world.beliefs(remus).length, 2);

  const third = world.step();
  assert.deepEqual(third.map(d => d.action), [{ type: 'move', actor: remus, destination: corridor }]);
  assert.equal(world.currentRoom(remus), corridor);
  const fourth = world.step();
  assert.deepEqual(fourth.map(d => d.action), [{ type: 'move', actor: remus, destination: library }]);
  assert.equal(world.currentRoom(remus), library);
  const fifth = world.step();
  assert.deepEqual(fifth.map(d => d.action), [{ type: 'ask_about', actor: remus, listener: lily, object: cup }]);
  assert.equal(fifth[0]?.result.events.length, 2);
  assert.deepEqual(fifth[0]?.result.events[0], {
    type: 'question_asked', actor: remus, listener: lily, object: cup, answered: true
  });
  assert.deepEqual(world.beliefs(remus).at(-1), {
    claim: { kind: 'broke_object', culprit: james, object: cup },
    evidence: {
      kind: 'testimony', speaker: lily,
      eventSequence: world.events().length,
      origin: { kind: 'vision' }
    }
  });
  assert.deepEqual(world.step(), []); // finite, no interrogating the same person endlessly
  assert.equal(world.assessment(remus, cup).status, 'contested'); // not omniscient
});

test('NPC explores by exits, not by cheating with remote character positions', () => {
  const left = livingSchool();
  const right = livingSchool();
  left.apply({ type: 'move', actor: left.lily, destination: left.corridor });
  right.apply({ type: 'move', actor: right.lily, destination: right.corridor });
  right.apply({ type: 'move', actor: right.lily, destination: right.library });

  // Same accessible local evidence, same first three policy decisions.
  const decisions = (world: typeof left.world) => {
    const a = [];
    for (let t = 0; t < 3; t++) a.push(world.step().map(d => d.action.type));
    return a;
  };
  assert.deepEqual(decisions(left.world), [
    ['inspect_object'], ['ask_about'], ['move']
  ]);
  assert.deepEqual(decisions(right.world), [
    ['inspect_object'], ['ask_about'], ['move']
  ]);
  assert.equal(left.world.currentRoom(left.remus), left.corridor);
  assert.equal(right.world.currentRoom(right.remus), right.corridor);
  // Having arrived locally, the first scenario discovers Lily and can ask.
  assert.deepEqual(left.world.step().map(d => d.action), [
    { type: 'ask_about', actor: left.remus, listener: left.lily, object: left.cup }
  ]);
  // The second doesn't see her yet, so discovers the library instead.
  assert.deepEqual(right.world.step().map(d => d.action), [
    { type: 'move', actor: right.remus, destination: right.library }
  ]);
});

test('unreachable witnesses lead to a finite search instead of endless wandering', () => {
  const scene = createBrokenCupScenario(); // library deliberately disconnected
  const { world, lily, james, remus, peter, cup, door, corridor, classroom } = scene;
  world.execute({ type: 'break_object', actor: james, target: cup });
  world.execute({ type: 'open_door', actor: lily, door });
  world.execute({ type: 'move', actor: remus, destination: classroom });
  world.execute({ type: 'tell', actor: lily, listener: remus,
    claim: { kind: 'broke_object', culprit: peter, object: cup } });
  world.execute({ type: 'tell', actor: james, listener: remus,
    claim: { kind: 'broke_object', culprit: james, object: cup } });
  world.setGuarded(james, true);
  world.setSocialInvestigator(remus, true);
  world.execute({ type: 'move', actor: lily, destination: corridor });
  const commands = Array.from({ length: 8 }, () => world.step().map(d => d.action.type));
  assert.deepEqual(commands, [
    ['ask_about'], ['move'], ['ask_about'], ['move'], [], [], [], []
  ]);
});

test('a question cannot manufacture facts if the respondent knows nothing', () => {
  const { world, lily, james, cup, classroom } = createBrokenCupScenario();
  const newcomer = world.character('newcomer', 'Новенький', classroom);
  world.execute({ type: 'break_object', actor: james, target: cup });
  const result = world.execute({ type: 'ask_about', actor: lily, listener: newcomer, object: cup });
  assert.deepEqual(result, { ok: true, events: [
    { type: 'question_asked', actor: lily, listener: newcomer, object: cup, answered: false }
  ] });
  assert.deepEqual(world.beliefs(newcomer), []);
  assert.equal(world.beliefs(lily).length, 1);
});

test('someone without a clue cannot ask about an unknown object by ID', () => {
  const { world, remus, lily, cup, door, classroom } = createBrokenCupScenario();
  world.execute({ type: 'open_door', actor: lily, door });
  world.execute({ type: 'move', actor: remus, destination: classroom });
  assert.deepEqual(world.execute({ type: 'ask_about', actor: remus, listener: lily, object: cup }),
    { ok: false, reason: 'not_known', events: [] });
});

test('a guarded person withholds incriminating memory without falsifying facts', () => {
  const { world, lily, james, cup } = createBrokenCupScenario();
  world.execute({ type: 'break_object', actor: james, target: cup });
  world.setGuarded(james, true);
  const response = world.execute({ type: 'ask_about', actor: lily, listener: james, object: cup });
  assert.equal(response.ok, true);
  assert.equal(response.events.length, 1);
  assert.deepEqual(world.beliefs(lily), [{
    claim: { kind: 'broke_object', culprit: james, object: cup },
    evidence: { kind: 'vision', eventSequence: 1 }
  }]);
  assert.equal(world.events().filter(e => e.type === 'testimony_delivered').length, 0);
});

test('a relayed report is not presented as direct witnessing', () => {
  const { world, lily, james, cup, classroom } = createBrokenCupScenario();
  const narrator = world.character('narrator', 'Слушатель', classroom);
  world.execute({ type: 'break_object', actor: james, target: cup });
  // The narrator hears Lily, not the original event: create the observer
  // afterwards to avoid an automatic visual memory.
  const later = world.character('later', 'Поздний слушатель', classroom);
  world.execute({ type: 'tell', actor: lily, listener: later,
    claim: { kind: 'broke_object', culprit: james, object: cup } });
  world.execute({ type: 'ask_about', actor: narrator, listener: later, object: cup });
  // narrator witnessed breakage, so this question is legal; origin of later's
  // answer must still identify it as hearsay, not a visual observation.
  const memory = world.beliefs(narrator).at(-1);
  assert.deepEqual(memory?.evidence.kind === 'testimony' && memory.evidence.origin,
    { kind: 'testimony', speaker: lily });
});

test('memories and evidence sources do not leak through returned references', () => {
  const { world, lily, james, remus, cup, door, classroom } = createBrokenCupScenario();
  world.execute({ type: 'break_object', actor: james, target: cup });
  world.execute({ type: 'open_door', actor: lily, door });
  world.execute({ type: 'move', actor: remus, destination: classroom });
  world.execute({ type: 'tell', actor: lily, listener: remus,
    claim: { kind: 'broke_object', culprit: james, object: cup } });
  world.execute({ type: 'ask_about', actor: remus, listener: lily, object: cup });
  const snap = world.beliefs(remus);
  const last = snap.at(-1)?.evidence;
  if (last?.kind === 'testimony' && last.origin) last.origin.kind = 'vision';
  // Replace the origin to detect deep cloning (the actual original is vision).
  if (last?.kind === 'testimony') {
    last.origin = { kind: 'testimony', speaker: remus };
  }
  const again = world.beliefs(remus).at(-1)?.evidence;
  assert.deepEqual(again, {
    kind: 'testimony', speaker: lily,
    eventSequence: world.events().length,
    origin: { kind: 'vision' }
  });
});
