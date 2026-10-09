import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirstRoom } from '../src/scenarios/first-room.ts';

test('Lily starts in the Gryffindor common room', () => {
  const { world, lily, commonRoom } = createFirstRoom();
  assert.equal(world.currentRoom(lily), commonRoom);
  assert.deepEqual(world.occupants(commonRoom), [lily]);
});

test('moving Lily into the corridor updates ECS and emits exactly one event', () => {
  const { world, lily, commonRoom, corridor } = createFirstRoom();
  const result = world.execute({ type: 'move', actor: lily, destination: corridor });
  assert.equal(result.ok, true);
  assert.equal(world.currentRoom(lily), corridor);
  assert.deepEqual(world.occupants(commonRoom), []);
  assert.deepEqual(world.occupants(corridor), [lily]);
  assert.deepEqual(world.events(), [{ type: 'entity_moved', actor: lily, from: commonRoom, to: corridor }]);
});

test('Lily cannot teleport to an unconnected room; no event is emitted', () => {
  const { world, lily, commonRoom, library } = createFirstRoom();
  const result = world.execute({ type: 'move', actor: lily, destination: library });
  assert.deepEqual(result, { ok: false, reason: 'no_passage', events: [] });
  assert.equal(world.currentRoom(lily), commonRoom);
  assert.deepEqual(world.events(), []);
});

test('different simulation instances do not share component data', () => {
  const first = createFirstRoom();
  const second = createFirstRoom();
  first.world.execute({ type: 'move', actor: first.lily, destination: first.corridor });
  assert.equal(second.world.currentRoom(second.lily), second.commonRoom);
  assert.deepEqual(second.world.events(), []);
});

test('a room cannot act like a character', () => {
  const { world, commonRoom, corridor } = createFirstRoom();
  const result = world.execute({ type: 'move', actor: commonRoom, destination: corridor });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'not_character');
});
