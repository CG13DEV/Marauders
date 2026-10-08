/**
 * [GAME] Daily living patterns on a ten-minute academic clock.
 * Behaviour follows time, location and *personal* memories, not omniscience.
 * No fabricated social ties or numerical friendship meters.
 */
import type { CommitmentPriority } from './social-commitments.ts';
export type MealKind = 'breakfast' | 'lunch' | 'dinner';
export type SocialTopic = 'lessons' | 'castle' | 'hobbies';
export type SocialStyle = 'outgoing' | 'reserved';
export type DailyLifePlan = {
  homeRoom: number;
  /** Social meeting space, distinct from private sleeping room. */
  socialRoom?: number;
  /** Optional weekend destination such as a library or the courtyard. */
  leisureRoom?: number;
  diningRoom: number;
  style: SocialStyle;
  interest: SocialTopic;
  /** Opt-in distance-aware scheduling. Absent means legacy 20-minute lead. */
  schoolPlanning?: 'adaptive';
  /** Default protects academic commitments; alternative models character choice. */
  commitmentPriority?: CommitmentPriority;
  /** Opt-in, world-scoped autonomous invitation & response policy. */
  socialInvitations?: boolean;
  /** Opt-in intention: negotiate real tutoring only when personally lacking knowledge. */
  learningAppointments?: boolean;
  /** Opt-in resumable goal queue with bodily needs (Experiment #18). */
  intentionPlanning?: boolean;
};
export type MealMemory = { day: number; kind: MealKind; minute: number };
export type ConversationMemory = {
  partner: number;
  topic: SocialTopic;
  minute: number;
};
export type RestMemory = { day: number; minute: number };

export function dayOf(minute: number): number {
  return Math.floor(minute / 1440);
}
export function localTime(minute: number): number {
  return minute % 1440;
}
export function mealAt(minute: number): MealKind | null {
  const m = localTime(minute);
  if (m >= 480 && m < 520) return 'breakfast'; // 08:00–08:40
  if (m >= 720 && m < 770) return 'lunch'; // 12:00–12:50
  if (m >= 1080 && m < 1140) return 'dinner'; // 18:00–19:00
  return null;
}
export function isWeekend(minute: number): boolean {
  return dayOf(minute) % 7 >= 5;
}
export function isLeisure(minute: number): boolean {
  const m = localTime(minute);
  return (m >= 1150 && m < 1230) ||
    (isWeekend(minute) && m >= 540 && m < 690);
}
export function leisureDestination(plan: DailyLifePlan, minute: number): number {
  return isWeekend(minute)
    ? (plan.leisureRoom ?? plan.socialRoom ?? plan.homeRoom)
    : (plan.socialRoom ?? plan.homeRoom);
}

export function shouldReturnHome(minute: number): boolean {
  const m = localTime(minute);
  return m >= 1140 || m < 420 ||
    (isWeekend(minute) && m >= 520 && m < 720);
}
export function isSleepTime(minute: number): boolean {
  const m = localTime(minute);
  return m >= 1320 || m < 420;
}

export function ateMeal(
  records: readonly MealMemory[], day: number, kind: MealKind
): boolean {
  return records.some(record => record.day === day && record.kind === kind);
}

export function talkedToday(
  records: readonly ConversationMemory[], day: number
): boolean {
  return records.some(record => dayOf(record.minute) === day);
}

export function chooseLocalCompanion(
  actor: number,
  people: readonly number[],
  history: readonly ConversationMemory[],
  day: number,
  trust: (other: number) => 'trusted' | 'neutral' | 'distrusted'
): number | null {
  if (talkedToday(history, day)) return null;
  const contacts = people
    .filter(other => other !== actor && trust(other) !== 'distrusted')
    .map(other => ({
      other,
      preference: trust(other) === 'trusted' ? 0 : 1,
      meetings: history.filter(m => m.partner === other).length
    }))
    .sort((a, b) =>
      a.preference - b.preference ||
      a.meetings - b.meetings ||
      a.other - b.other);
  return contacts[0]?.other ?? null;
}
