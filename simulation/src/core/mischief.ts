/**
 * [GAME] #31.2-31.3: local initiative and autobiographical motivation.
 * No global event log or authoritative meeting status enters this policy.
 */
import type {CommitmentMemory} from './social-commitments.ts';
import {unresolvedPersonalAbsence} from './personal-outcomes.ts';

export type MischiefDisposition='reckless'|'cautious'|'reactive';
export type LivedMotive={kind:'unreconciled_absence';partner:number;meetingId:number};

/**
 * Only a personal "waited_alone" memory can produce the experimental impulse.
 * A later personally remembered reunion with the same partner reconciles it.
 * This is a deliberately bounded 180-minute response, not an emotion score.
 */
export function livedMischiefMotive(
  history:readonly CommitmentMemory[],minute:number
):LivedMotive|null{
  const memory=unresolvedPersonalAbsence(history,minute,180);
  return memory?{kind:'unreconciled_absence',partner:memory.partner,
    meetingId:memory.meetingId}:null;
}

export function chooseMischiefTarget(input:{
  disposition:MischiefDisposition;
  intactObjects:readonly number[];
  bystanders:readonly number[];
  motive?:LivedMotive|null;
}):number|null{
  // Reactive characters have no standing intent to destroy things. Their
  // opportunity only becomes meaningful after a personally lived setback.
  if(input.disposition==='reactive'&&!input.motive)return null;
  if(input.disposition!=='reckless'&&input.bystanders.length>0)
    return null;
  // Deterministic co-located tie-break; no special fixture object ID.
  return input.intactObjects.length?Math.min(...input.intactObjects):null;
}
