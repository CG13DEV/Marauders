/**
 * [GAME] #31.4: after physically resolved promises, align the *next*
 * opportunity across forks. Nobody scripts a chat or an escape command.
 * Choice comes from the same world.step() and ordinary command validators.
 */
import {createSimulation} from '../core/Simulation.ts';
import type {Trust} from '../core/cognition.ts';

export type SocialFork={
  experience:'waited'|'kept'|'both_absent'|'no_promise';
  friendTrust:Trust;
  companionPresent:boolean;
  friendPresent?:boolean;
  manual?:boolean;
  lesson?:boolean;
};
export function runSocialChoiceFork(input:SocialFork){
  const world=createSimulation();
  const gallery=world.room('gallery','Галерея');
  const corridor=world.room('corridor','Коридор');
  const distant=world.room('distant','Кабинет');
  world.connect(gallery,corridor);
  world.connect(corridor,distant);
  const pupil=world.character('pupil','Ученик',gallery);
  const friend=world.character('friend','Друг',gallery);
  const companion=world.character('companion','Знакомая',gallery);
  const plan={
    homeRoom:gallery,diningRoom:gallery,leisureRoom:gallery,
    style:'reserved' as const,interest:'castle' as const
  };
  world.setDailyLife(pupil,{...plan,socialChoice:'reflective'});
  world.setDailyLife(friend,plan);
  world.setDailyLife(companion,plan);
  world.setTrust(pupil,friend,input.friendTrust);
  // Manual control here is only to preserve the factual initial meeting
  // alternatives; it is turned off before actors evaluate their future scene.
  world.setManualControl(friend,true);
  world.setManualControl(companion,true);
  const move=(actor:number,to:number)=>{
    const result=world.execute({type:'move',actor,destination:to});
    if(!result.ok)throw Error('Fixture movement invalid: '+result.reason);
  };
  const sendAway=(actor:number)=>{
    move(actor,corridor);move(actor,distant);
  };
  const bringBack=(actor:number)=>{
    move(actor,corridor);move(actor,gallery);
  };
  if(input.experience!=='no_promise'){
    const pledge=world.execute({
      type:'promise_meeting',actor:friend,listener:pupil,
      room:gallery,atMinute:1110,purpose:'explore'
    });
    if(!pledge.ok)throw Error('Fixture promise invalid: '+pledge.reason);
  }
  if(input.experience==='waited'||input.experience==='both_absent')
    sendAway(friend);
  if(!input.companionPresent)sendAway(companion);
  if(input.experience==='both_absent'){
    world.setManualControl(pupil,true);
    move(pupil,corridor);
  }
  // From 08:00 to 18:50; a 18:30 promise has now genuinely resolved.
  for(let tick=1;tick<=65;tick++)world.step();
  const meetingStatus=world.meetingLedger()[0]?.status??null;
  const memories=world.promiseHistory(pupil).map(m=>m.kind);
  // Counterfactual intervention controls only who is *available* later.
  // It never calls chat, moves the protagonist during the decision phase,
  // creates an intention, nor sets their motives.
  if(input.experience==='both_absent'){
    move(pupil,gallery);
    world.setManualControl(pupil,false);
  }
  if(input.friendPresent!==false &&
    world.currentRoom(friend)===distant)bringBack(friend);
  if(input.friendPresent===false &&
    world.currentRoom(friend)===gallery)sendAway(friend);
  world.setManualControl(friend,false);
  world.setManualControl(companion,false);
  if(input.manual)world.setManualControl(pupil,true);
  if(input.lesson)world.setTimetable(pupil,[{
    id:'evening-duty',subject:'Чары',room:gallery,
    startsAt:1150,endsAt:1190
  }]);
  // One ordinary 19:00 tick, followed by free time at 19:10.
  world.step();
  const opportunity={
    minute:world.clock().absoluteMinute,
    pupilRoom:world.currentRoom(pupil)===gallery,
    friendPresent:world.currentRoom(friend)===gallery,
    companionPresent:world.currentRoom(companion)===gallery,
    meetingStatus,memories
  };
  const decisions=world.step();
  const chosen=decisions.filter(x=>x.actor===pupil).map(x=>({
    type:x.action.type,
    listener:'listener' in x.action?
      x.action.listener===friend?'friend':
      x.action.listener===companion?'companion':'other':null,
    destination:'destination' in x.action?
      x.action.destination===corridor?'corridor':'other':null,
    ok:x.result.ok
  }));
  const socialEvents=world.events().filter(e=>
    e.type==='conversation_shared'&&e.actor===pupil);
  return {
    input,opportunity,decisions:chosen,
    outcome:{
      chattedWith:socialEvents.map(e=>
        e.type==='conversation_shared'
          ?e.listener===friend?'friend':e.listener===companion?'companion':'other'
          :'other'),
      leftGallery:world.currentRoom(pupil)===corridor,
      stayedInGallery:world.currentRoom(pupil)===gallery,
      conversationCount:world.conversationHistory(pupil).length,
      friendConversationCount:world.conversationHistory(friend).length,
      brokenPromiseRemembered:memories.includes('waited_alone'),
      successfulMeetingRemembered:memories.includes('met'),
      harmfulIncidents:world.events().filter(e=>e.type==='object_broken').length
    }
  };
}
