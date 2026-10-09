import test from 'node:test';
import assert from 'node:assert/strict';
import { perceiveCrash } from '../src/core/perception-rules.ts';

test('vision gives detailed observation in the same room', () => {
  assert.equal(perceiveCrash({
    sameRoom: true, adjacentRoom: false, openView: false, vision: true, hearing: true
  }), 'witnessed');
});

test('a closed door blocks vision but permits nearby hearing', () => {
  assert.equal(perceiveCrash({
    sameRoom: false, adjacentRoom: true, openView: false, vision: true, hearing: true
  }), 'heard');
});

test('hearing does not pass two room connections', () => {
  assert.equal(perceiveCrash({
    sameRoom: false, adjacentRoom: false, openView: false, vision: true, hearing: true
  }), null);
});

test('a character without sight or hearing receives no observation', () => {
  assert.equal(perceiveCrash({
    sameRoom: true, adjacentRoom: false, openView: false, vision: false, hearing: false
  }), null);
});
