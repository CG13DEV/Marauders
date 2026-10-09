import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrokenCupScenario } from '../src/scenarios/broken-cup.ts';
import { createSimulation } from '../src/core/Simulation.ts';

test('closed door: Lily sees the culprit, Remus hears an anonymous crash, Peter hears nothing', () => {
  const { world, lily, james, remus, peter, cup } = createBrokenCupScenario();
  const result = world.execute({ type: 'break_object', actor: james, target: cup });
  assert.equal(result.ok, true);
  assert.equal(world.isBroken(cup), true);

  assert.deepEqual(world.observations(lily), [
    { kind: 'witnessed_breakage', source: 'vision', actor: james, target: cup }
  ]);
  assert.deepEqual(world.observations(remus), [
    { kind: 'heard_crash', source: 'hearing' }
  ]);
  assert.equal(JSON.stringify(world.observations(remus)).includes('actor'), false);
  assert.equal(JSON.stringify(world.observations(remus)).includes('target'), false);
  assert.deepEqual(world.observations(peter), []);

  // The omniscient log remains factual, but is NOT passed to a character AI.
  assert.deepEqual(world.events(), [
    { type: 'object_broken', actor: james, target: cup, room: world.currentRoom(james) }
  ]);
});

test('opening a connecting door allows seeing the same breakage across its threshold', () => {
  const { world, james, remus, cup } = createBrokenCupScenario({ doorOpen: true });
  world.execute({ type: 'break_object', actor: james, target: cup });
  assert.deepEqual(world.observations(remus), [
    { kind: 'witnessed_breakage', source: 'vision', actor: james, target: cup }
  ]);
});

test('a closed door also blocks walking through it', () => {
  const { world, remus, classroom, corridor } = createBrokenCupScenario();
  const result = world.execute({ type: 'move', actor: remus, destination: classroom });
  assert.deepEqual(result, { ok: false, reason: 'door_closed', events: [] });
  assert.equal(world.currentRoom(remus), corridor);
  assert.deepEqual(world.events(), []);
});

test('rebreaking the cup is rejected without duplicate events or observations', () => {
  const { world, james, lily, cup } = createBrokenCupScenario();
  assert.equal(world.execute({ type: 'break_object', actor: james, target: cup }).ok, true);
  const second = world.execute({ type: 'break_object', actor: james, target: cup });
  assert.deepEqual(second, { ok: false, reason: 'already_broken', events: [] });
  assert.equal(world.events().length, 1);
  assert.equal(world.observations(lily).length, 1);
});

test('a character cannot break an object in another room', () => {
  const { world, remus, cup } = createBrokenCupScenario();
  const result = world.execute({ type: 'break_object', actor: remus, target: cup });
  assert.deepEqual(result, { ok: false, reason: 'not_in_reach', events: [] });
  assert.equal(world.isBroken(cup), false);
  assert.deepEqual(world.events(), []);
});

test('lack of senses prevents observations even when present in the room', () => {
  const world = createSimulation();
  const room = world.room('room', 'Комната');
  const james = world.character('james', 'Джеймс', room);
  const witness = world.character('witness', 'Свидетель', room, { vision: false, hearing: false });
  const cup = world.fragileObject('cup', 'Чашка', room);
  world.execute({ type: 'break_object', actor: james, target: cup });
  assert.deepEqual(world.observations(witness), []);
});

test('observation snapshots cannot mutate character memory', () => {
  const { world, james, lily, cup } = createBrokenCupScenario();
  world.execute({ type: 'break_object', actor: james, target: cup });
  const snapshot = world.observations(lily);
  snapshot.length = 0;
  assert.equal(world.observations(lily).length, 1);
});

test('a second world does not inherit broken objects or knowledge', () => {
  const first = createBrokenCupScenario();
  const second = createBrokenCupScenario();
  first.world.execute({ type: 'break_object', actor: first.james, target: first.cup });
  assert.equal(second.world.isBroken(second.cup), false);
  assert.deepEqual(second.world.observations(second.lily), []);
  assert.deepEqual(second.world.events(), []);
});
