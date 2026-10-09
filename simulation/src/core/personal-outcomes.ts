/**
 * [GAME] Autobiographical meeting outcomes shared by independent policies.
 * Only first-person met/waited_alone records are evidence of an outcome.
 * Invitations, replies and promises do NOT resolve a lived setback.
 *
 * The projection does not persist mutable state or read world meeting ledgers.
 */
import type {CommitmentMemory} from './social-commitments.ts';

const isOutcome=(record:CommitmentMemory)=>
  record.kind==='met'||record.kind==='waited_alone';

export function latestPersonalOutcome(
  history:readonly CommitmentMemory[],partner:number
):CommitmentMemory|null{
  for(let i=history.length-1;i>=0;i--){
    const event=history[i]!;
    if(event.partner===partner&&isOutcome(event))return event;
  }
  return null;
}

/** Most recent still-unreconciled personally witnessed missed meeting.
 * A later `met` reconciles only the SAME partner. Recency concerns motive,
 * not the long-lived fact that a promise was broken.
 */
export function unresolvedPersonalAbsence(
  history:readonly CommitmentMemory[],minute:number,maxAge:number
):CommitmentMemory|null{
  const metAfter=new Set<number>();
  for(let i=history.length-1;i>=0;i--){
    const event=history[i]!;
    if(event.minute>minute)continue;
    if(event.kind==='met'){metAfter.add(event.partner);continue;}
    if(event.kind==='waited_alone'&&
       !metAfter.has(event.partner)&&minute-event.minute<=maxAge)
      return event;
  }
  return null;
}
