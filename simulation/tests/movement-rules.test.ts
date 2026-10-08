import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMovement, type MovementFacts } from '../src/core/movement-rules.ts';

const valid: MovementFacts = {
  actorExists: true, isCharacter: true,
  destinationExists: true, destinationIsRoom: true,
  currentRoom: 10, destination: 20, hasPassage: true
};

test('a connected room is reachable', () => {
  assert.equal(validateMovement(valid), null);
});

test('a disconnected room cannot be reached', () => {
  assert.equal(validateMovement({ ...valid, hasPassage: false }), 'no_passage');
});

test('a character cannot move to the room they already occupy', () => {
  assert.equal(validateMovement({ ...valid, destination: 10 }), 'already_there');
});

test('a non-character cannot execute character movement', () => {
  assert.equal(validateMovement({ ...valid, isCharacter: false }), 'not_character');
});

test('an unknown room is rejected', () => {
  assert.equal(validateMovement({ ...valid, destinationExists: false }), 'unknown_destination');
});

test('a closed door rejects movement across an existing passage', () => {
  assert.equal(validateMovement({ ...valid, passageOpen: false }), 'door_closed');
});
