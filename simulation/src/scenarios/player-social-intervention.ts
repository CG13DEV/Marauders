/**
 * [GAME] #31.11: a player can intervene through the SAME validated commands
 * as any resident. The NPC answers itself in world.step(): no scenario calls
 * answer_meeting, injects its memory, or reads global events as an NPC input.
 */
import {createPersistentSimulation,restoreCheckpoint} from '../core/persistence.ts';
import type {MeetingPurpose} from '../core/social-commitments.ts';

export function runPlayerSocialFork(
  purpose:MeetingPurpose,contextual=true
){
  const world=createPersistentSimulation();
  const common=world.room('common','Common room');
  const library=world.room('library','Library');
  world.connect(common,library);
  const player=world.character('player','Player',common);
  const classmate=world.character('classmate','Classmate',common);
  // A human action source, not an autonomous story-controller.
  world.setManualControl(player,true);
  world.setTrust(classmate,player,'trusted');
  world.setTrust(player,classmate,'trusted');
  world.setDailyLife(classmate,{
    homeRoom:library,diningRoom:library,socialRoom:library,
    leisureRoom:library,style:'outgoing',interest:'lessons',
    socialInvitations:true,relationshipLearning:true,
    contextualRelationships:contextual
  });
  const first=world.execute({
    type:'promise_meeting',actor:player,listener:classmate,
    room:library,atMinute:540,purpose:'explore'
  });
  if(!first.ok)throw Error('Fixture initial promise: '+first.reason);
  // Player deliberately does not travel. The NPC chooses its journey.
  for(let i=0;i<9;i++)world.step();
  const firstMeeting=world.meetingLedger()[0];
  const npcFirsthand=world.promiseHistory(classmate).map(m=>m.kind);
  // Player reappears, now offering help in one of two contexts.
  // Nothing grants player access to NPC's private first-person feelings.
  const move=world.execute({type:'move',actor:player,destination:library});
  if(!move.ok)throw Error('Player travel: '+move.reason);
  const personalBefore=world.promiseHistory(player);
  const observedPlace=world.currentRoom(player);
  const occupants=observedPlace===null?[]:world.occupants(observedPlace);
  const atMinute=world.clock().absoluteMinute+120;
  const offer=world.execute({
    type:'offer_meeting',actor:player,listener:classmate,
    room:library,atMinute,purpose
  });
  if(!offer.ok)throw Error('Player offer: '+offer.reason);
  // The only active action injected after setup was the PLAYER'S offer.
  const answers=world.step().filter(d=>d.actor===classmate&&
    d.action.type==='answer_meeting');
  const reply=world.meetingLedger().at(-1)!;
  const npcHistory=world.promiseHistory(classmate);
  const playerHistory=world.promiseHistory(player);
  const copy=restoreCheckpoint(world.checkpoint());
  return {
    purpose,contextual,
    firstMeeting:firstMeeting?.status??null,
    npcFirsthand,playerPrivateMemory:personalBefore.map(m=>m.kind),
    playerObservedClassmate:occupants.includes(classmate),
    offerAcceptedByExecutor:offer.ok,
    npcAutonomousAnswer:answers.length===1,
    answer:reply.status,
    npcTrustOverall:world.trustOf(classmate,player),
    npcTrustForStudy:world.trustForPurpose(classmate,player,'study'),
    npcTrustForExploration:world.trustForPurpose(classmate,player,'explore'),
    npcWitnessedAbsence:npcHistory.some(m=>m.kind==='waited_alone'),
    playerWitnessedAbsence:playerHistory.some(m=>m.kind==='waited_alone'),
    checkpoint:{
      sameRuntime:JSON.stringify(copy.captureRuntime())===
        JSON.stringify(world.captureRuntime()),
      sameStudyTrust:copy.trustForPurpose(classmate,player,'study')===
        world.trustForPurpose(classmate,player,'study'),
      sameExploreTrust:copy.trustForPurpose(classmate,player,'explore')===
        world.trustForPurpose(classmate,player,'explore')
    }
  };
}
