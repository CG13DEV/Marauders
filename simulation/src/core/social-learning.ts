import type { SpellId } from './spellcraft.ts';
import type { Trust } from './cognition.ts';

/**
 * One conversation request is a social fact. It never proves whether the
 * addressee actually knows the subject.
 */
export type TutoringRequest = {
  requester: number;
  helper: number;
  spell: SpellId;
  minute: number;
};

export type AssistanceMemory = {
  helper: number;
  spell: SpellId;
  minute: number;
};

export function willingToTutor(facts: {
  helpful: boolean;
  trustsRequester: Trust;
  knowsConcept: boolean;
  learnerNeedsConcept: boolean;
}): boolean {
  return facts.helpful &&
    facts.trustsRequester !== 'distrusted' &&
    facts.knowsConcept &&
    facts.learnerNeedsConcept;
}

export function copyRequest(request: TutoringRequest): TutoringRequest {
  return { ...request };
}
