/**
 * [GAME] #31.5/#31.9 — directed relationships from firsthand evidence.
 * Multiple independent letdowns survive one physically fulfilled repair.
 * A repair is linked to its concrete cause, never a generic forgiveness event.
 * Explicit trust and personal memories remain the ONLY persisted sources;
 * reloading a checkpoint must not reapply a relationship penalty.
 */
import type {Trust} from './cognition.ts';
import type {CommitmentMemory} from './social-commitments.ts';
import {latestPersonalOutcome,unresolvedPersonalAbsences} from './personal-outcomes.ts';

export type RelationshipEvidence={
  trust:Trust;
  basis:'explicit'|'waited_alone'|'partial_repair'|'kept_after_setback';
  meetingId?:number;
  minute?:number;
};

export function relationshipFromExperience(
  baseline:Trust,history:readonly CommitmentMemory[],partner:number
):RelationshipEvidence{
  const pending=unresolvedPersonalAbsences(history,partner);
  if(pending.length){
    const latestPending=pending.at(-1)!;
    const latest=latestPersonalOutcome(history,partner);
    // The new successful experience may repair one particular wrong, but
    // it cannot erase separate failures. No numerical friendship score.
    return {
      trust:baseline==='trusted'?'neutral':'distrusted',
      basis:latest?.kind==='met'?'partial_repair':'waited_alone',
      meetingId:latestPending.meetingId,minute:latestPending.minute
    };
  }
  const latest=latestPersonalOutcome(history,partner);
  if(!latest)return {trust:baseline,basis:'explicit'};
  const hadSetback=history.some(x=>x.partner===partner&&
    x.kind==='waited_alone'&&x.minute<=latest.minute);
  // Fulfilled promises restore the baseline after the LAST unresolved
  // setback was addressed, but never upgrade an unrelated relationship.
  return hadSetback&&latest.kind==='met'
    ?{trust:baseline,basis:'kept_after_setback',
      meetingId:latest.meetingId,minute:latest.minute}
    :{trust:baseline,basis:'explicit'};
}
