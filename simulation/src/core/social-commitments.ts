/**
 * [GAME] Location-bound social promises and autobiographical evidence.
 * The world resolves facts; observers only receive facts they personally
 * witnessed. A global expired state is NOT a private mental observation.
 */
import type { SpellId } from './spellcraft.ts';
import {latestPersonalOutcome} from './personal-outcomes.ts';
export type MeetingPurpose = 'study' | 'explore';
export type CommitmentPriority = 'school_first' | 'promise_first';
export type MeetingStatus =
  'offered' | 'pending' | 'declined' | 'unanswered' | 'kept' | 'expired';

export type MeetingCommitment = {
  id: number;
  promisor: number;
  beneficiary: number;
  room: number;
  atMinute: number;
  purpose: MeetingPurpose;
  /** Optional concrete learning goal; never a generic RPG experience reward. */
  spell?: SpellId;
  /** Actual guarded teaching action succeeded at the agreed meeting. */
  taught?: boolean;
  status: MeetingStatus;
};

export type CommitmentMemory = {
  meetingId: number;
  partner: number;
  kind: 'promised' | 'heard_promise' | 'offered' | 'invited' |
    'accepted' | 'declined' | 'met' | 'waited_alone';
  minute: number;
  room: number;
  purpose: MeetingPurpose;
  spell?: SpellId;
};

/** A promise must be a future, tick-aligned meeting rather than a ghost event. */
export function validMeetingTime(now: number, atMinute: number): boolean {
  return Number.isSafeInteger(atMinute) &&
    atMinute % 10 === 0 &&
    atMinute >= now + 20 &&
    atMinute <= now + 7*1440;
}

export function isActivePromise(meeting: MeetingCommitment, minute: number): boolean {
  return meeting.status === 'pending' &&
    minute < meeting.atMinute + 20;
}

export function hasMeetingConflict(
  meetings: readonly MeetingCommitment[],
  first: number, second: number, atMinute: number
): boolean {
  return meetings.some(m =>
    (m.status === 'pending' || m.status === 'offered') &&
    (m.promisor === first || m.beneficiary === first ||
     m.promisor === second || m.beneficiary === second) &&
    Math.abs(m.atMinute - atMinute) < 40);
}

/** Remembered unreconciled absence affects whom the observer will approach. */
export function personallyAvoids(
  history: readonly CommitmentMemory[], partner: number
): boolean {
  return latestPersonalOutcome(history,partner)?.kind === 'waited_alone';
}
