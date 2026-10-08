/**
 * [GAME] Experiment #17: a learning intention is derived from a *personal*
 * knowledge gap, not fabricated by a quest giver or a global NPC registry.
 *
 * Only co-present candidates, the learner's own social history, and the
 * public clock enter this pure planning function. The world later validates
 * every proposed invitation, its consent and the actual teaching action.
 */
import type { SpellId } from './spellcraft.ts';
import type { Trust } from './cognition.ts';
import type { CommitmentMemory } from './social-commitments.ts';
import { personallyAvoids } from './social-commitments.ts';
import { dayOf } from './daily-life.ts';

export type StudyIntention = {
  kind: 'learn_concept';
  spell: SpellId;
  helper: number;
  room: number;
  atMinute: number;
};

export function planStudyIntention(input: {
  learner: number;
  gaps: readonly SpellId[];
  room: number;
  candidates: readonly number[];
  attempted: ReadonlySet<string>;
  memories: readonly CommitmentMemory[];
  trust: (id: number) => Trust;
  available: (id: number) => boolean;
  minute: number;
}): StudyIntention | null {
  const spell=input.gaps[0];
  if(!spell)return null;
  // Never peek into a candidate's actual knowledge or hidden intentions.
  const helper=[...new Set(input.candidates)]
    .filter(id=>id!==input.learner &&
      input.available(id) &&
      input.trust(id)!=='distrusted' &&
      !personallyAvoids(input.memories,id) &&
      !input.attempted.has(`${id}:${spell}`))
    .sort((a,b)=>a-b)[0];
  if(helper===undefined)return null;
  return {
    kind:'learn_concept',spell,helper,room:input.room,
    atMinute:(dayOf(input.minute)+1)*1440+19*60+40
  };
}
