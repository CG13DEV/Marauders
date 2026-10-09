/**
 * [GAME] #31.5 — directed relationships derived from first-person evidence.
 * A witnessed broken appointment downgrades one qualitative step. A later
 * actually kept appointment with that same person clears this particular
 * setback. A conversation alone never does; no hidden status or emotion bar.
 *
 * This is a projection of original directed trust + autobiographical memory.
 * Both remain the sole authoritative data in saves. This projection is never
 * independently persisted, so checkpoint restoration cannot double-apply it.
 */
import type {Trust} from './cognition.ts';
import type {CommitmentMemory} from './social-commitments.ts';

export type RelationshipEvidence={
  trust:Trust;
  basis:'explicit'|'waited_alone'|'kept_after_setback';
  meetingId?:number;
  minute?:number;
};

export function relationshipFromExperience(
  baseline:Trust,history:readonly CommitmentMemory[],partner:number
):RelationshipEvidence{
  const relevant=history.filter(x=>x.partner===partner&&
    (x.kind==='met'||x.kind==='waited_alone'));
  const latest=relevant.at(-1);
  if(!latest)return {trust:baseline,basis:'explicit'};
  if(latest.kind==='waited_alone')
    return {trust:baseline==='trusted'?'neutral':'distrusted',
      basis:'waited_alone',meetingId:latest.meetingId,minute:latest.minute};
  // Fulfilled promises after a setback are evidence of repair, not a
  // universal friendship upgrade. A non-friend remains a non-friend.
  const hadSetback=relevant.some(x=>x.kind==='waited_alone');
  return hadSetback
    ?{trust:baseline,basis:'kept_after_setback',
      meetingId:latest.meetingId,minute:latest.minute}
    :{trust:baseline,basis:'explicit'};
}
