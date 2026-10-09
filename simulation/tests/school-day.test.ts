import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirstRoom } from '../src/scenarios/first-room.ts';
import { createBrokenCupScenario } from '../src/scenarios/broken-cup.ts';

const lesson = (id: string, room: number, startsAt: number, endsAt: number) =>
  ({ id, subject: 'Чары', room, startsAt, endsAt });

test('a lesson-first Lily travels before class, attends punctually, and stays during class', () => {
  const { world, lily, corridor } = createFirstRoom();
  world.setRoutine(lily, [world.id('library')!]);
  world.setTimetable(lily, [lesson('charms', corridor, 510, 550)], 'lesson_first');
  assert.deepEqual(world.step().map(x => x.action.type), ['move']); // 08:10, class begins 08:30
  assert.equal(world.currentRoom(lily), corridor);
  assert.deepEqual(world.step(), []); // 08:20, she waits
  assert.deepEqual(world.step(), []); // 08:30, lesson starts
  assert.equal(world.attendance(lily)[0]?.status, 'on_time');
  assert.deepEqual(world.step(), []); // no leisure movement while class is active
  assert.equal(world.events().filter(x => x.type === 'lesson_attendance').length, 1);
  assert.equal(world.learningDebt(lily), 0);
});

test('missing an unreachable class creates a lasting one-lesson learning debt', () => {
  const { world, lily, commonRoom } = createFirstRoom();
  const farRoom = world.room('sealed', 'Недоступный кабинет');
  world.setTimetable(lily, [lesson('transfiguration', farRoom, 500, 520)]);
  for (let i = 0; i < 5; i++) world.step();
  assert.equal(world.currentRoom(lily), commonRoom);
  assert.equal(world.attendance(lily)[0]?.status, 'missed');
  assert.equal(world.learningDebt(lily), 1);
  assert.equal(world.events().filter(x => x.type === 'lesson_attendance').length, 1);
  for (let i = 0; i < 4; i++) world.step();
  assert.equal(world.learningDebt(lily), 1);
});

test('an inquiry-first Remus arrives late after choosing to investigate', () => {
  const { world, lily, james, remus, peter, cup, door, corridor, classroom, library } = createBrokenCupScenario();
  const potionRoom = world.room('potions', 'Зельеварение');
  world.connect(corridor, library);
  world.connect(corridor, potionRoom);
  const put = (command: Parameters<typeof world.execute>[0]) => {
    const result = world.execute(command);
    assert.equal(result.ok, true, JSON.stringify(result));
  };
  put({ type: 'break_object', actor: james, target: cup });
  put({ type: 'open_door', actor: lily, door });
  put({ type: 'move', actor: remus, destination: classroom });
  put({ type: 'tell', actor: lily, listener: remus,
    claim: { kind: 'broke_object', culprit: james, object: cup } });
  put({ type: 'tell', actor: james, listener: remus,
    claim: { kind: 'broke_object', culprit: peter, object: cup } });
  world.setGuarded(james, true);
  world.setInquisitive(remus, true);
  world.setSocialInvestigator(remus, true);
  world.setTrust(remus, lily, 'trusted');
  world.setRoutine(lily, [corridor, library]);
  world.setTimetable(remus, [lesson('potions', potionRoom, 520, 570)], 'inquiry_first');
  world.setTimetable(lily, [lesson('study', library, 520, 550)], 'lesson_first');
  for (let i = 0; i < 8; i++) world.step();
  assert.equal(world.attendance(lily)[0]?.status, 'on_time');
  assert.equal(world.attendance(remus)[0]?.status, 'late');
  assert.equal(world.attendance(remus)[0]?.arrivedAt, 550); // 09:10
  assert.equal(world.currentRoom(remus), potionRoom);
  assert.equal(world.learningDebt(remus), 0); // late is not absence
  assert.equal(world.beliefs(remus).length, 3);
});

test('school priorities can be set without contaminating independent worlds', () => {
  const first = createFirstRoom();
  const other = createFirstRoom();
  first.world.setTimetable(first.lily, [lesson('class', first.corridor, 510, 550)]);
  assert.deepEqual(other.world.attendance(other.lily), []);
  assert.equal(other.world.clock().label, '08:00');
  assert.throws(() => first.world.setTimetable(first.lily,
    [lesson('invalid', first.lily, 520, 550)]));
  assert.equal(first.world.attendance(first.lily)[0]?.id, 'class');
  const copy = first.world.attendance(first.lily);
  copy[0]!.status = 'missed';
  assert.equal(first.world.attendance(first.lily)[0]?.status, 'pending');
});

test('two consecutive lessons can lead to different attendance outcomes', () => {
  const { world, lily, corridor, library } = createFirstRoom();
  world.setTimetable(lily, [
    lesson('first', library, 490, 520), // requires two moves, arrives 08:20 -> late
    lesson('second', corridor, 540, 570) // early travel after first, on time
  ], 'lesson_first');
  for (let i = 0; i < 11; i++) world.step();
  assert.deepEqual(world.attendance(lily).map(a => a.status), ['late', 'on_time']);
  assert.equal(world.learningDebt(lily), 0);
});
