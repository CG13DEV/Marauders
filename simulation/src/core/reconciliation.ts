/**
 * [GAME] #31.8: accountable initiative from remembered OWN missed duty.
 * An absentee knows only that THEY failed to attend, not whether their
 * partner waited, was hurt or has forgiven them.
 * A new offer can be considered or refused. Only physical reunion is 'met'.
 */
import type {CommitmentMemory} from './social-commitments.ts';
import {unresolvedPersonalAbsences} from './personal-outcomes.ts';

export type RepairOpportunity={
  missedMeetingId:number;partner:number;room:number;minute:number;
};
export function ownUnrepairedCommitment(
  history:readonly CommitmentMemory[],minute:number
):RepairOpportunity|null{
  // The absent partner knows THEIR OWN lapses. Later attendance cannot
  // indiscriminately discharge several independent personal commitments.
  const outstanding=new Map<number,CommitmentMemory>();
  for(const event of history){
    if(event.minute>minute)continue;
    if(event.kind==='missed_my_promise'){
      outstanding.set(event.meetingId,event);
    }else if(event.kind==='met'){
      const target=event.repairOfMeetingId ??
        [...outstanding.values()].reverse()
          .find(m=>m.partner===event.partner)?.meetingId;
      if(target!==undefined&&outstanding.get(target)?.partner===event.partner)
        outstanding.delete(target);
    }
  }
  for(const miss of [...outstanding.values()].reverse()){
    if(minute-miss.minute>7*1440)continue;
    // One offered reparation per cause. A subsequent *missed* replacement
    // does not secretly absolve the original failure.
    if(history.some(x=>x.partner===miss.partner&&x.minute>=miss.minute&&
      x.kind==='offered'&&x.repairOfMeetingId===miss.meetingId))continue;
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
  return unresolvedPersonalAbsences(input.personalHistory,input.partner)
    .some(m=>m.meetingId===input.repairOfMeetingId);
}
