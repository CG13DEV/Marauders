/**
 * [GAME] #31.8: accountable initiative from remembered OWN missed duty.
 * An absentee knows only that THEY failed to attend, not whether their
 * partner waited, was hurt or has forgiven them.
 * A new offer can be considered or refused. Only physical reunion is 'met'.
 */
import type {CommitmentMemory} from './social-commitments.ts';

export type RepairOpportunity={
  missedMeetingId:number;partner:number;room:number;minute:number;
};
export function ownUnrepairedCommitment(
  history:readonly CommitmentMemory[],minute:number
):RepairOpportunity|null{
  // Newest first. The offer is a single sincere attempt, not a tick-by-tick
  // apology spam loop; subsequent 'met' with that partner makes it moot.
  for(let i=history.length-1;i>=0;i--){
    const miss=history[i]!;
    if(miss.kind!=='missed_my_promise'||miss.minute>minute||
       minute-miss.minute>7*1440)continue;
    const later=history.slice(i+1).filter(x=>x.partner===miss.partner);
    if(later.some(x=>x.kind==='met'||(
      x.kind==='offered'&&x.repairOfMeetingId===miss.meetingId)))continue;
    return {missedMeetingId:miss.meetingId,partner:miss.partner,
      room:miss.room,minute:miss.minute};
  }
  return null;
}

/** A repair invitation means something only to someone who personally waited.
 * It is NOT an automatic change of trust or emotional state.
 */
export function considersConcreteRepair(input:{
  personalHistory:readonly CommitmentMemory[];
  partner:number;
  repairOfMeetingId:number;
  response:'open'|'guarded'|undefined;
}):boolean{
  if(input.response!=='open')return false;
  return input.personalHistory.some(m=>m.partner===input.partner&&
    m.meetingId===input.repairOfMeetingId&&m.kind==='waited_alone');
}
