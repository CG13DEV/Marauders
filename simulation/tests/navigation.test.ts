import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRoomOnRoute } from '../src/core/navigation.ts';
import { createBrokenCupScenario } from '../src/scenarios/broken-cup.ts';

test('navigation chooses a shortest route through public topology', () => {
  const map = new Map<number, number[]>([
    [1, [3, 2]], [2, [1, 4]], [3, [1, 4]], [4, [2, 3]]
  ]);
  assert.equal(nextRoomOnRoute(1, 4, id => map.get(id) ?? []), 2);
  assert.equal(nextRoomOnRoute(1, 1, id => map.get(id) ?? []), null);
  assert.equal(nextRoomOnRoute(1, 99, id => map.get(id) ?? []), null);
});

test('Lily autonomously follows room goals over several ticks', () => {
  const { world, lily, commonRoom, corridor, library } = (() => {
    // Use the first-room scenario structure, leaving the social agents off.
    const w = createBrokenCupScenario();
    w.world.connect(w.corridor, w.library);
    return {
      world: w.world, lily: w.lily, commonRoom: w.classroom,
      corridor: w.corridor, library: w.library
    };
  })();
  world.execute({ type: 'open_door', actor: lily, door: world.id('classroom_door')! });
  world.setRoutine(lily, [corridor, library]);
  assert.deepEqual(world.step().map(x => x.action), [
    { type: 'move', actor: lily, destination: corridor }
  ]);
  assert.deepEqual(world.step().map(x => x.action), [
    { type: 'move', actor: lily, destination: library }
  ]);
  assert.equal(world.currentRoom(lily), library);
  assert.equal(world.tick(), 2);
  assert.deepEqual(world.step(), []);
  assert.equal(world.currentRoom(lily), library);
});

test('a routine can open a door then move on a subsequent tick', () => {
  const { world, lily, corridor, door } = createBrokenCupScenario();
  world.setRoutine(lily, [corridor]);
  assert.deepEqual(world.step().map(x => x.action), [
    { type: 'open_door', actor: lily, door }
  ]);
  assert.equal(world.currentRoom(lily), world.id('classroom'));
  assert.deepEqual(world.step().map(x => x.action), [
    { type: 'move', actor: lily, destination: corridor }
  ]);
  assert.deepEqual(world.step(), []);
});

test('an unreachable routine does not teleport a character', () => {
  const { world, lily, library, classroom } = createBrokenCupScenario();
  world.setRoutine(lily, [library]); // disconnected
  assert.deepEqual(world.step(), []);
  assert.deepEqual(world.step(), []);
  assert.equal(world.currentRoom(lily), classroom);
});

test('invalid route does not modify a previously valid routine', () => {
  const { world, lily, corridor, cup } = createBrokenCupScenario();
  world.setRoutine(lily, [corridor]);
  assert.throws(() => world.setRoutine(lily, [cup]));
  assert.deepEqual(world.step().map(x => x.action), [
    { type: 'open_door', actor: lily, door: world.id('classroom_door')! }
  ]);
});

test('itinerary and social investigation run independently for two NPCs', () => {
  const w = createBrokenCupScenario();
  const { world, lily, remus, james, peter, cup, door, corridor, library, classroom } = w;
  world.connect(corridor, library);
  world.execute({ type: 'break_object', actor: james, target: cup });
  world.execute({ type: 'open_door', actor: lily, door });
  world.execute({ type: 'move', actor: remus, destination: classroom });
  world.execute({ type: 'tell', actor: lily, listener: remus,
    claim: { kind: 'broke_object', culprit: james, object: cup } });
  world.execute({ type: 'tell', actor: james, listener: remus,
    claim: { kind: 'broke_object', culprit: peter, object: cup } });
  world.setGuarded(james, true);
  world.setInquisitive(remus, true);
  world.setSocialInvestigator(remus, true);
  world.setRoutine(lily, [corridor, library]);
  assert.deepEqual(world.step().map(x => x.action.type), ['inspect_object', 'move']);
  assert.deepEqual(world.step().map(x => x.action.type), ['ask_about', 'move']);
  assert.equal(world.currentRoom(lily), library);
  assert.deepEqual(world.step().map(x => x.action.type), ['move']);
  assert.deepEqual(world.step().map(x => x.action.type), ['move']);
  assert.deepEqual(world.step().map(x => x.action.type), ['ask_about']);
  assert.deepEqual(world.step(), []);
  const remusMemory = world.beliefs(remus).at(-1);
  assert.equal(remusMemory?.evidence.kind, 'testimony');
  if (remusMemory?.evidence.kind === 'testimony') {
    assert.deepEqual(remusMemory.evidence.origin, { kind: 'vision' });
  }
});
