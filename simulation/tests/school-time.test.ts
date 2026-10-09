import test from 'node:test';
import assert from 'node:assert/strict';
import { schoolTime, validateTimetable, registerAttendance, type AttendanceRecord } from '../src/core/school-time.ts';

test('the clock advances in deterministic ten-minute ticks from 08:00', () => {
  assert.deepEqual(schoolTime(0), { day: 1, absoluteMinute: 480, hour: 8, minute: 0, label: '08:00' });
  assert.equal(schoolTime(6).label, '09:00');
  assert.equal(schoolTime(96).day, 2);
  assert.equal(schoolTime(96).label, '00:00');
});

test('overlapping lessons, duplicate IDs and malformed times are rejected', () => {
  const one = { id: 'charms', subject: 'Чары', room: 1, startsAt: 520, endsAt: 560 };
  assert.doesNotThrow(() => validateTimetable([one, { ...one, id: 'potions', startsAt: 560, endsAt: 600 }]));
  assert.throws(() => validateTimetable([one, { ...one, id: 'potions', startsAt: 550, endsAt: 600 }]));
  assert.throws(() => validateTimetable([one, one]));
  assert.throws(() => validateTimetable([{ ...one, endsAt: 519 }]));
  assert.throws(() => validateTimetable([{ ...one, startsAt: 479 }]));
  assert.throws(() => validateTimetable([{ ...one, startsAt: 520.5 }]));
});

test('attendance records only one arrival, or one missed lesson', () => {
  const record = (): AttendanceRecord => ({
    id: 'test', subject: 'Чары', room: 1, startsAt: 520, endsAt: 550, status: 'pending'
  });
  const present = [record()];
  assert.deepEqual(registerAttendance(present, 520, 1).map(x => x.status), ['on_time']);
  assert.deepEqual(registerAttendance(present, 530, 1), []);
  const late = [record()];
  assert.deepEqual(registerAttendance(late, 530, 1).map(x => x.status), ['late']);
  const absent = [record()];
  assert.deepEqual(registerAttendance(absent, 540, 2), []);
  assert.deepEqual(registerAttendance(absent, 550, 1).map(x => x.status), ['missed']);
  assert.deepEqual(registerAttendance(absent, 560, 1), []);
});
