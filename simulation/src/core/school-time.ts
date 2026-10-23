import { isSpellId, type SpellId } from './spellcraft.ts';
import {isMagicPrimitive,type MagicPrimitive} from './magic-graph.ts';

/** Gameplay-only clock: ten simulated minutes per world step, starting at 08:00. */
/** Absolute minutes allow lessons to be scheduled across multiple days. */
export const SCHOOL_START_MINUTE = 8 * 60;
export const MINUTES_PER_TICK = 10;

export type Lesson = {
  id: string;
  subject: string;
  room: number;
  startsAt: number; // absolute minute since day zero
  endsAt: number;
  /** Optional technique explicitly taught at startsAt + ten minutes. */
  spell?: SpellId;
  /** [GAME] A principle taught explicitly, NOT the implementation of a spell. */
  primitive?:MagicPrimitive;
  /** Academic provenance: different groups share physical teaching spaces. */
  groupId?: string;
  teacher?: number;
};
export type AttendanceStatus = 'pending' | 'on_time' | 'late' | 'missed';
export type AttendanceRecord = Lesson & {
  status: AttendanceStatus;
  arrivedAt?: number;
};
export type SchoolPriority = 'lesson_first' | 'inquiry_first';

export function schoolTime(tick: number) {
  const absoluteMinute = SCHOOL_START_MINUTE + tick * MINUTES_PER_TICK;
  const minuteOfDay = absoluteMinute % 1440;
  return {
    day: Math.floor(absoluteMinute / 1440) + 1,
    absoluteMinute,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
    label: `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`
  };
}

export function validateTimetable(lessons: readonly Lesson[]): void {
  const ids = new Set<string>();
  const sorted = [...lessons].sort((a, b) => a.startsAt - b.startsAt);
  for (let i = 0; i < sorted.length; i++) {
    const lesson = sorted[i]!;
    if (!lesson.id.trim() || !lesson.subject.trim() || ids.has(lesson.id) ||
        !Number.isInteger(lesson.startsAt) || !Number.isInteger(lesson.endsAt) ||
        lesson.startsAt < SCHOOL_START_MINUTE ||
        lesson.startsAt >= lesson.endsAt ||
        (lesson.spell !== undefined && (
          !isSpellId(lesson.spell) ||
          lesson.endsAt - lesson.startsAt < 20 ||
          lesson.startsAt % 10 !== 0)) ||
        (lesson.primitive!==undefined && (!isMagicPrimitive(lesson.primitive) ||
          lesson.endsAt-lesson.startsAt<20 || lesson.startsAt%10!==0))) {
      throw new Error('Invalid or duplicated school lesson');
    }
    if (i > 0 && sorted[i - 1]!.endsAt > lesson.startsAt) {
      throw new Error('Overlapping school lessons');
    }
    ids.add(lesson.id);
  }
}

export function currentLesson(
  lessons: readonly AttendanceRecord[],
  minute: number,
  leadMinutes = 20
): AttendanceRecord | undefined {
  return lessons.find(x => minute >= x.startsAt - leadMinutes && minute < x.endsAt);
}

/** Arrival-based MVP attendance. This does not yet measure participation or early departure. */
export function registerAttendance(
  lessons: AttendanceRecord[],
  minute: number,
  room: number | null
): AttendanceRecord[] {
  const changed: AttendanceRecord[] = [];
  for (const lesson of lessons) {
    if (lesson.status !== 'pending') continue;
    if (minute >= lesson.startsAt && minute < lesson.endsAt && room === lesson.room) {
      lesson.status = minute === lesson.startsAt ? 'on_time' : 'late';
      lesson.arrivedAt = minute;
      changed.push({ ...lesson });
    } else if (minute >= lesson.endsAt) {
      lesson.status = 'missed';
      changed.push({ ...lesson });
    }
  }
  return changed;
}
