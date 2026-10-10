/**
 * [GAME] Autobiographical meeting outcomes shared by independent policies.
 * A kept appointment can reconcile at most ONE personally witnessed failure.
 * Explicit repair lineage identifies which failure it addresses; an ordinary
 * kept meeting may reconcile the newest unresolved absence (legacy #31.5).
 * This is a read-only projection of personal events, never a stored mood bar.
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

/** Resolve observed absences only with later, physically kept appointments.
 * Keep independent partner ledgers and meeting IDs: a conversation, accepted
 * offer, wrong repair reference or meeting with someone else resolves nothing.
 */
function pendingAbsences(
  history:readonly CommitmentMemory[],throughMinute=Infinity
):Map<number,Map<number,CommitmentMemory>>{
  const byPartner=new Map<number,Map<number,CommitmentMemory>>();
  for(const event of history){
    if(event.minute>throughMinute)continue;
    if(!isOutcome(event))continue;
    let pending=byPartner.get(event.partner);
    if(!pending){
      pending=new Map<number,CommitmentMemory>();
      byPartner.set(event.partner,pending);
    }
    if(event.kind==='waited_alone'){
      pending.set(event.meetingId,event);
    }else{
      // A concrete attempt repairs its stated cause, not every older hurt.
      // An ordinary kept appointment continues the original 31.5 behaviour
      // but also clears only one outstanding setback.
      const target=event.repairOfMeetingId ??
        [...pending.keys()].at(-1);
      if(target!==undefined)pending.delete(target);
    }
  }
  return byPartner;
}

/** Remaining first-person grievances against precisely this partner. */
export function unresolvedPersonalAbsences(
  history:readonly CommitmentMemory[],partner:number
):CommitmentMemory[]{
  return [...(pendingAbsences(history).get(partner)?.values()??[])];
}

/** Most recent still-unreconciled firsthand absence within a motive window.
 * Recency affects spontaneous motivation, NOT whether old memories exist.
 */
export function unresolvedPersonalAbsence(
  history:readonly CommitmentMemory[],minute:number,maxAge:number
):CommitmentMemory|null{
  let latest:CommitmentMemory|null=null;
  for(const pending of pendingAbsences(history,minute).values())
    for(const event of pending.values())
      if(event.minute<=minute&&minute-event.minute<=maxAge&&
         (latest===null||event.minute>latest.minute))
        latest=event;
  return latest;
}
