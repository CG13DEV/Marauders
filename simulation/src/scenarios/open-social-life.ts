/**
 * [GAME] #31.6 open-world social microcosm.
 *
 * Setup chooses physical topology, resident policies and directed baseline trust.
 * AFTER setup there are no scripted execute(), movement, promises, lessons,
 * injuries or manual-control interventions: every action comes from step().
 *
 * These pupils are Marauder-era *experimental avatars*, not CANON psychology.
 */
import {createPersistentSimulation,restoreCheckpoint} from '../core/persistence.ts';
import type {Trust} from '../core/cognition.ts';
import {latestPersonalOutcome} from '../core/personal-outcomes.ts';

export type SocialWorldVariant='mutual'|'reserved_reply'|'no_invitations'|'separated'|
  'lesson_first'|'promise_first';
export type TraceEntry={
  minute:number;day:number;actor:string;action:string;
  target?:string;ok:boolean;
  firsthandOutcome:string|null;
  knownPartnerTrust:Trust|null;
  previousConversations:number;
  nearbyPeople:string[];
};
export function runOpenSocialWorld(
  variant:SocialWorldVariant='mutual',days=3
){
  if(!Number.isSafeInteger(days)||days<3||days>7)
    throw Error('Open-world test requires 3–7 days');
  const world=createPersistentSimulation();
  const common=world.room('common','Гостиная');
  const corridor=world.room('corridor','Коридор');
  const library=world.room('library','Библиотека');
  world.connect(common,corridor);
  world.connect(corridor,library);
  const names=['James','Sirius','Remus','Peter'] as const;
  const ids=names.map((name,index)=>world.character(name,name,
    variant==='separated'&&index>=2?library:common));
  const nameOf=(id:number)=>names[ids.indexOf(id)]??'other';
  const defaultPlan={
    homeRoom:common,diningRoom:common,
    socialRoom:common,leisureRoom:common,
    style:'outgoing' as const,interest:'castle' as const,
    socialChoice:'reflective' as const,relationshipLearning:true,
    socialInvitations:variant!=='no_invitations'
  };
  ids.forEach((id,i)=>{
    world.setDailyLife(id,{
      ...defaultPlan,
      ...(variant==='reserved_reply'&&i===1
        ?{style:'reserved' as const}:{}),
      ...(variant==='separated'&&i>=2
        ?{homeRoom:library,diningRoom:library,
          socialRoom:library,leisureRoom:library}:{})
    });
  });
  // #31.7: The competing academic duty exists from world creation.
  // No NPC is ordered to leave, break a promise or repair a relationship.
  if(variant==='lesson_first'||variant==='promise_first'){
    const james=ids[0]!;
    const original={...defaultPlan,
      ...(variant==='promise_first'?{commitmentPriority:'promise_first' as const}:{})};
    world.setDailyLife(james,original);
    world.setTimetable(james,[{id:'evening-study',subject:'Supervised study',
      room:library,startsAt:2610,endsAt:2670}], 'lesson_first');
  }
  // Fixed initial relationship configuration, not a pre-seeded experience.
  world.setTrust(ids[0]!,ids[1]!,'trusted');
  world.setTrust(ids[1]!,ids[0]!,'trusted');
  const initial={
    tick:world.tick(),
    worldEvents:world.events().length,
    conversations:ids.reduce((n,id)=>n+world.conversationHistory(id).length,0),
    meetings:world.meetingLedger().length,
    memories:ids.reduce((n,id)=>n+world.promiseHistory(id).length,0)
  };
  const trace:TraceEntry[]=[];
  const conflictSnapshots: Array<{
    minute:number;
    firstMeetingStatus:string|null;
    jamesRoom:string;
    siriusRoom:string;
    jamesTrust:Trust;
    siriusTrust:Trust;
    jamesOutcome:string|null;
    siriusOutcome:string|null;
    lessonStatus:string|null;
  }>=[];
  const totalTicks=days*144;
  for(let i=0;i<totalTicks;i++){
    const before=ids.map((actor)=>({
      actor,
      trusts:ids.map((partner)=>world.trustOf(actor,partner)),
      local:world.currentRoom(actor),
      nearby:world.currentRoom(actor)===null?[]:
        world.occupants(world.currentRoom(actor)!).filter(x=>x!==actor)
          .map(nameOf).sort(),
      conversations:world.conversationHistory(actor).length,
      // Inputs are ONLY this actor's personal ledger (never world events).
      outcomes:ids.map((partner)=>latestPersonalOutcome(
        world.promiseHistory(actor),partner)?.kind??null)
    }));
    const decisions=world.step();
    const minute=world.clock().absoluteMinute;
    if(minute===2640||minute===4070){
      const [james,sirius]=ids;
      conflictSnapshots.push({
        minute,
        firstMeetingStatus:world.meetingLedger()[0]?.status??null,
        jamesRoom:world.currentRoom(james!)===library?'library':'common_or_corridor',
        siriusRoom:world.currentRoom(sirius!)===common?'common':'elsewhere',
        jamesTrust:world.trustOf(james!,sirius!),
        siriusTrust:world.trustOf(sirius!,james!),
        jamesOutcome:latestPersonalOutcome(world.promiseHistory(james!),sirius!)?.kind??null,
        siriusOutcome:latestPersonalOutcome(world.promiseHistory(sirius!),james!)?.kind??null,
        lessonStatus:world.attendance(james!)[0]?.status??null
      });
    }
    for(const decision of decisions){
      if(!decision.result.ok)throw Error('Unexpected invalid autonomous action: '+
        decision.action.type+':'+decision.result.reason);
      const remembered=before.find(x=>x.actor===decision.actor);
      if(!remembered)continue;
      const action=decision.action;
      const target='listener' in action?nameOf(action.listener):undefined;
      const partner=target?ids.indexOf(
        ids.find(id=>nameOf(id)===target)??-1):-1;
      trace.push({
        minute,day:Math.floor(minute/1440),actor:nameOf(decision.actor),
        action:action.type,
        ...(target===undefined?{}:{target}),
        ok:decision.result.ok,
        firsthandOutcome:partner>=0?
          remembered.outcomes[partner]??null:null,
        knownPartnerTrust:partner>=0?remembered.trusts[partner]??null:null,
        previousConversations:remembered.conversations,
        nearbyPeople:remembered.nearby
      });
    }
  }
  // Event ledger is used for **post-hoc diagnostics only**, never NPC input.
  const events=world.events().filter(event=>
    event.type==='conversation_shared'||
    event.type==='meeting_offered'||
    event.type==='meeting_answered'||
    event.type==='meeting_resolved'||
    event.type==='object_broken').map(event=>({
      type:event.type,minute:'minute' in event?event.minute:null,
      actor:nameOf(event.actor),
      ...('listener' in event?{listener:nameOf(event.listener)}:{}),
      ...('outcome' in event?{outcome:event.outcome}:{}),
      ...('accepted' in event?{accepted:event.accepted}:{})
    }));
  const summary={
    chats:events.filter(x=>x.type==='conversation_shared').length,
    offers:events.filter(x=>x.type==='meeting_offered').length,
    accepted:events.filter(x=>x.type==='meeting_answered'&&x.accepted).length,
    declined:events.filter(x=>x.type==='meeting_answered'&&!x.accepted).length,
    kept:events.filter(x=>x.type==='meeting_resolved'&&x.outcome==='kept').length,
    expired:events.filter(x=>x.type==='meeting_resolved'&&x.outcome==='expired').length,
    harms:events.filter(x=>x.type==='object_broken').length,
    directedRelationships:ids.map((actor,i)=>({
      actor:names[i],trustToSirius:world.trustOf(actor,ids[1]!),
      rememberedMeetings:world.promiseHistory(actor)
        .filter(x=>x.kind==='met').length,
      personallyUnmet:world.promiseHistory(actor)
        .filter(x=>x.kind==='waited_alone').length
    }))
  };
  const restored=restoreCheckpoint(world.checkpoint());
  const checkpoint={
    sameRuntime:JSON.stringify(restored.captureRuntime())===
      JSON.stringify(world.captureRuntime()),
    sameRelationships:ids.every(actor=>ids.every(partner=>
      world.trustOf(actor,partner)===restored.trustOf(actor,partner)))
  };
  return {
    experiment:'31.6',classification:'[GAME]' as const,variant,days,
    initial,trace,events,summary,checkpoint,conflictSnapshots,
    interpretation:'Trace records pre-tick personal inputs and actual autonomous actions; it does not claim to reveal a hidden thought process.'
  };
}
