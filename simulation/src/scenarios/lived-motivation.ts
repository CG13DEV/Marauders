/**
 * [GAME] #31.3. One common disposition, one ordinary fragile object,
 * and the same late opportunity. Only lived meeting outcomes differ.
 * The scenario NEVER issues break_object nor seeds a grievance.
 */
import {createSimulation} from '../core/Simulation.ts';
import {livedMischiefMotive} from '../core/mischief.ts';

export type MemoryFork='kept'|'waited_alone'|'both_absent'|'no_promise';
export function runLivedMotivationFork(fork:MemoryFork){
  const world=createSimulation();
  const gallery=world.room('gallery','Галерея');
  const corridor=world.room('corridor','Коридор');
  const distant=world.room('distant','Дальний кабинет');
  world.connect(gallery,corridor);
  world.connect(corridor,distant);
  const pupil=world.character('pupil','Ученик',gallery);
  const friend=world.character('friend','Друг',gallery);
  const vase=world.fragileObject('vase','Ваза',gallery);
  world.setDailyLife(pupil,{
    homeRoom:gallery,diningRoom:gallery,
    style:'reserved',interest:'hobbies',mischief:'reactive'
  });
  // Friend's itinerary is the controlled input, not the protagonist's
  // attitude. Manual control prevents unsolicited return to the meeting.
  world.setManualControl(friend,true);
  const apply=(type:'move',actor:number,destination:number)=>{
    const outcome=world.execute({type,actor,destination});
    if(!outcome.ok)throw Error('Invalid fixture movement: '+outcome.reason);
  };
  if(fork!=='no_promise'){
    const meeting=world.execute({
      type:'promise_meeting',actor:friend,listener:pupil,
      room:gallery,atMinute:540,purpose:'explore'
    });
    if(!meeting.ok)throw Error('Fixture promise rejected: '+meeting.reason);
  }
  if(fork!=='kept'){
    apply('move',friend,corridor);
    apply('move',friend,distant);
  }
  if(fork==='both_absent'){
    world.setManualControl(pupil,true);
    apply('move',pupil,corridor);
  }
  const initial={broken:world.isBroken(vase),motive:
    livedMischiefMotive(world.promiseHistory(pupil),world.clock().absoluteMinute)};
  // tick 8 = 09:20. A pending missed promise only expires 20 minutes
  // after the 09:00 appointment; it is not premature "mind-reading".
  for(let tick=1;tick<=8;tick++)world.step();
  const atResolution={
    clock:world.clock().absoluteMinute,
    meetingStatus:world.meetingLedger()[0]?.status??null,
    memory:world.promiseHistory(pupil).map(x=>x.kind),
    personalMotive:livedMischiefMotive(
      world.promiseHistory(pupil),world.clock().absoluteMinute)
  };
  // Align the *future* local opportunity across all four worlds:
  // pupil alone in the gallery, same intact vase, no open appointment.
  if(fork==='kept'){
    apply('move',friend,corridor);
    apply('move',friend,distant);
  }
  if(fork==='both_absent'){
    apply('move',pupil,gallery);
    world.setManualControl(pupil,false);
  }
  const opportunity={
    pupilInGallery:world.currentRoom(pupil)===gallery,
    friendElsewhere:world.currentRoom(friend)===distant,
    intact:!world.isBroken(vase),
    time:world.clock().absoluteMinute
  };
  const decisions:Array<{tick:number;actor:string;action:string;ok:boolean}>=[];
  for(let tick=9;tick<=14;tick++)
    for(const decision of world.step())
      decisions.push({
        tick,actor:decision.actor===pupil?'pupil':'other',
        action:decision.action.type,ok:decision.result.ok
      });
  const history=world.promiseHistory(pupil);
  return {
    fork,initial,atResolution,opportunity,
    outcome:{
      broken:world.isBroken(vase),
      spontaneousBreaks:decisions.filter(d=>
        d.actor==='pupil'&&d.action==='break_object'&&d.ok).length,
      breakEvents:world.events().filter(e=>
        e.type==='object_broken'&&e.actor===pupil&&e.target===vase).length,
      rememberedAbsence:history.some(h=>h.kind==='waited_alone'),
      rememberedMeeting:history.some(h=>h.kind==='met'),
      friendObservedBreaking:world.beliefs(friend).some(b=>
        b.claim.object===vase&&b.claim.culprit===pupil),
      activeMotiveAtEnd:livedMischiefMotive(
        history,world.clock().absoluteMinute)
    },
    decisions
  };
}
