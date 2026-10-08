import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersistentSimulation, restoreSimulation, serializeSimulation } from '../src/core/persistence.ts';

function makeSchool() {
  const school = createPersistentSimulation();
  const classroom = school.room('charms', 'Кабинет чар');
  const hall = school.room('hall', 'Коридор');
  const library = school.room('library', 'Библиотека');
  const door = school.connect(classroom, hall, {
    door: { key: 'classroom_door', label: 'Дверь класса', open: false }
  })!;
  school.connect(hall, library);
  const lily = school.character('lily', 'Лили', classroom);
  const remus = school.character('remus', 'Ремус', hall);
  const james = school.character('james', 'Джеймс', classroom);
  const cup = school.fragileObject('cup', 'Чашка', classroom);
  school.seedSpellKnowledge(james, 'lumos', 'independent');
  school.setTimetable(lily, [{
    id: 'charms', subject: 'Чары', room: classroom,
    startsAt: 510, endsAt: 550, spell: 'lumos'
  }], 'lesson_first');
  school.setTimetable(remus, [{
    id: 'charms', subject: 'Чары', room: classroom,
    startsAt: 510, endsAt: 550, spell: 'lumos'
  }], 'inquiry_first');
  school.setTrust(remus, lily, 'trusted');
  school.setInquisitive(remus, true);
  school.setHelpful(lily, true);
  school.setHelpSeeking(remus, true);
  school.setGuarded(james, true);
  school.setExperimenter(james, true);
  assert.equal(school.execute({ type: 'break_object', actor: james, target: cup }).ok, true);
  assert.equal(school.execute({ type: 'open_door', actor: lily, door }).ok, true);
  assert.equal(school.execute({ type: 'tell', actor: lily, listener: remus,
    claim: { kind: 'broke_object', culprit: james, object: cup } }).ok, false); // no teleporting talk
  school.setRoutine(lily, [library]);
  return { school, classroom, hall, library, door, lily, remus, james, cup };
}

test('replay roundtrips complete world, observations, lessons, traits and events', () => {
  const original = makeSchool();
  for (let i = 0; i < 9; i++) original.school.step();
  const saved = serializeSimulation(original.school);
  const loaded = restoreSimulation(saved);
  assert.equal(loaded.snapshot().audit, original.school.snapshot().audit);
  assert.equal(loaded.clock().label, original.school.clock().label);
  assert.equal(loaded.id('lily') !== undefined, true);
  assert.deepEqual(loaded.events(), original.school.events());
  assert.deepEqual(loaded.attendance(loaded.id('lily')!), original.school.attendance(original.lily));
  assert.deepEqual(loaded.beliefs(loaded.id('remus')!), original.school.beliefs(original.remus));
  assert.equal(loaded.isBroken(loaded.id('cup')!), true);
  assert.equal(loaded.doorIsOpen(loaded.id('classroom_door')!), true);
});

test('a restored game can continue with identical authoritative and character-local outcomes', () => {
  const { school, lily, remus, classroom, hall } = makeSchool();
  for (let i = 0; i < 8; i++) school.step();
  const loaded = restoreSimulation(school.snapshot());
  for (let i = 0; i < 12; i++) {
    school.step();
    loaded.step();
  }
  assert.equal(school.snapshot().audit, loaded.snapshot().audit);
  assert.equal(school.clock().absoluteMinute, loaded.clock().absoluteMinute);
});

test('JSON save and load leaves no shared mutable references', () => {
  const { school, lily } = makeSchool();
  const saved = school.snapshot();
  const loaded = restoreSimulation(saved);
  const previous = school.events().length;
  saved.operations.push({ kind: 'step' });
  assert.equal(loaded.tick(), 0);
  assert.equal(school.tick(), 0);
  loaded.step();
  assert.equal(school.tick(), 0);
  assert.equal(school.events().length, previous);
  assert.equal(loaded.tick(), 1);
  assert.equal(school.id('lily'), lily);
});

test('invalid, unsupported or mismatched replays are rejected', () => {
  const { school } = makeSchool();
  const original = school.snapshot();
  assert.throws(() => restoreSimulation('not json'));
  assert.throws(() => restoreSimulation(JSON.stringify({ ...original, version: 999 })));
  assert.throws(() => restoreSimulation(JSON.stringify({ ...original, format: 'wrong' })));
  assert.throws(() => restoreSimulation(JSON.stringify({ ...original, audit: 'forged' })), /diverged/);
  const tampered = school.snapshot();
  tampered.operations.splice(0, 1);
  assert.throws(() => restoreSimulation(tampered));
  const unknown = school.snapshot();
  (unknown.operations as Array<unknown>).push({ kind: 'teleport_everyone' });
  assert.throws(() => restoreSimulation(unknown), /Unsupported journal operation/);
});

test('failed actions do not enter the replay log', () => {
  const { school, remus, cup } = makeSchool();
  const before = school.snapshot().operations.length;
  assert.equal(school.execute({ type: 'break_object', actor: remus, target: cup }).ok, false);
  assert.equal(school.snapshot().operations.length, before);
  assert.equal(restoreSimulation(serializeSimulation(school)).snapshot().audit, school.snapshot().audit);
});

test('one week without active movement can be reconstructed and continued', () => {
  const w = createPersistentSimulation();
  const hall = w.room('hall', 'Коридор');
  const child = w.character('child', 'Ученик', hall);
  for (let t = 0; t < 1008; t++) w.step(); // 7 * 24 * 6, ten-minute world ticks
  assert.equal(w.clock().day, 8);
  assert.equal(w.clock().label, '08:00');
  const loaded = restoreSimulation(serializeSimulation(w));
  assert.equal(loaded.tick(), 1008);
  assert.equal(loaded.currentRoom(loaded.id('child')!), hall);
  assert.equal(loaded.snapshot().audit, w.snapshot().audit);
  w.step(); loaded.step();
  assert.equal(loaded.snapshot().audit, w.snapshot().audit);
});

test('external command mutations after a snapshot remain replayable', () => {
  const { school, james, classroom, library } = makeSchool();
  const before = serializeSimulation(school);
  const later = restoreSimulation(before);
  school.setRoutine(james, [library]);
  later.setRoutine(later.id('james')!, [later.id('library')!]);
  for(let i=0; i<5; i++){school.step();later.step();}
  assert.equal(school.snapshot().audit, later.snapshot().audit);
});
