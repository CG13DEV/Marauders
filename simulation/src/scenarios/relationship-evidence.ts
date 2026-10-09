/**
 * [GAME] #31.5: externally varying one promise outcome, not the NPC's choice.
 * The same later room, people, duty-free time and explicit trust meet a
 * different first-person evidence ledger. No scripted chat or trust rewrite.
 */
import {createPersistentSimulation,restoreCheckpoint} from '../core/persistence.ts';
import type {Trust} from '../core/cognition.ts';

export type RelationFork='broken'|'repaired'|'kept'|'both_absent'|'no_promise';
export type RelationOptions={
  baseline?:Trust;
  optIn?:boolean;
};
export function runRelationshipFork(fork:RelationFork,options:RelationOptions={}){
  const world=createPersistentSimulation();
  const gallery=world.room('gallery','Галерея');
  const corridor=world.room('corridor','Коридор');
  const distant=world.room('distant','Кабинет');
  world.connect(gallery,corridor);
  world.connect(corridor,distant);
  const pupil=world.character('pupil','Первокурсник',gallery);
  const friend=world.character('friend','Друг',gallery);
  const companion=world.character('companion','Знакомая',gallery);
  const baseline=options.baseline??'trusted';
  const optIn=options.optIn!==false;
  const plan={
    homeRoom:gallery,diningRoom:gallery,leisureRoom:gallery,
    style:'reserved' as const,interest:'castle' as const
  };
  world.setDailyLife(pupil,{
    ...plan,socialChoice:'reflective',
    ...(optIn?{relationshipLearning:true}:{})
  });
  world.setDailyLife(friend,plan);
  world.setDailyLife(companion,plan);
  world.setTrust(pupil,friend,baseline);
  world.setManualControl(pupil,true);
  world.setManualControl(friend,true);
  world.setManualControl(companion,true);
  const move=(actor:number,to:number)=>{
    const result=world.execute({type:'move',actor,destination:to});
    if(!result.ok)throw Error('Fixture movement rejected: '+result.reason);
  };
  const sendAway=(actor:number)=>{move(actor,corridor);move(actor,distant);};
  const returnTo=(actor:number)=>{move(actor,corridor);move(actor,gallery);};
  if(fork!=='no_promise'){
    const result=world.execute({
      type:'promise_meeting',actor:friend,listener:pupil,
      room:gallery,atMinute:1110,purpose:'explore'
    });
    if(!result.ok)throw Error('Fixture promise rejected: '+result.reason);
  }
  if(fork!=='kept')sendAway(friend);
  if(fork==='both_absent')move(pupil,corridor);

  for(let i=0;i<65;i++)world.step(); // time 1130, missed promise resolves
  const firstResult={
    minute:world.clock().absoluteMinute,
    status:world.meetingLedger()[0]?.status??null,
    relationship:world.relationshipOf(pupil,friend),
    oppositeTrust:world.trustOf(friend,pupil),
    evidence:world.promiseHistory(pupil).map(m=>m.kind)
  };
  // Partner's eventual arrival is controlled *only* as a future opportunity.
  if(world.currentRoom(friend)===distant)returnTo(friend);
  if(fork==='both_absent')move(pupil,gallery);
  if(fork==='repaired'){
    const next=world.execute({
      type:'promise_meeting',actor:friend,listener:pupil,
      room:gallery,atMinute:1180,purpose:'explore'
    });
    if(!next.ok)throw Error('Follow-up promise rejected: '+next.reason);
  }
  for(let i=0;i<6;i++)world.step(); // time 1190
  const afterOpportunity={
    minute:world.clock().absoluteMinute,
    pupilHere:world.currentRoom(pupil)===gallery,
    friendHere:world.currentRoom(friend)===gallery,
    companionHere:world.currentRoom(companion)===gallery,
    baseline:world.explicitTrustOf(pupil,friend),
    actual:world.relationshipOf(pupil,friend),
    oppositeTrust:world.trustOf(friend,pupil),
    memories:world.promiseHistory(pupil).map(m=>m.kind),
    meetingStatuses:world.meetingLedger().map(m=>m.status)
  };
  // Checkpoint contains only canonical baseline trust + firsthand memories.
  const before=world.captureRuntime().trusts;
  const restored=restoreCheckpoint(world.checkpoint());
  const checkpoint={
    explicit:restored.explicitTrustOf(pupil,friend),
    effective:restored.trustOf(pupil,friend),
    projection:restored.relationshipOf(pupil,friend),
    storedTrusts:before,
    restoredTrusts:restored.captureRuntime().trusts
  };
  world.setManualControl(pupil,false);
  world.setManualControl(friend,false);
  world.setManualControl(companion,false);
  const decisions=world.step();
  const pupilDecisions=decisions.filter(d=>d.actor===pupil).map(d=>({
    type:d.action.type,
    listener:'listener' in d.action
      ? d.action.listener===friend?'friend':
        d.action.listener===companion?'companion':'other'
      :null,
    ok:d.result.ok
  }));
  const conversations=world.conversationHistory(pupil);
  return {
    fork,baseline,optIn,firstResult,afterOpportunity,checkpoint,
    final:{
      minute:world.clock().absoluteMinute,
      choice:pupilDecisions,
      spokenTo:conversations.map(c=>
        c.partner===friend?'friend':c.partner===companion?'companion':'other'),
      pupilTrust:world.trustOf(pupil,friend),
      friendTrust:world.trustOf(friend,pupil),
      promiseHistory:world.promiseHistory(pupil).map(m=>m.kind),
      noFabricatedReconciliation:
        fork!=='repaired'||world.promiseHistory(pupil)
          .filter(m=>m.partner===friend&&m.kind==='met').length===0,
      incidents:world.events().filter(e=>e.type==='object_broken').length
    }
  };
}
