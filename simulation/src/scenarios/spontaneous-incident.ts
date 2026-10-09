/**
 * [GAME] #31.2: NO scenario-issued break_object.
 * Same schedules, policy, and topology; intervene only on disposition,
 * visible opportunity, a local witness, or manual control.
 */
import {createSimulation} from '../core/Simulation.ts';
import type {MischiefDisposition} from '../core/mischief.ts';

export type SpontaneousFork={
  disposition:MischiefDisposition|null;
  objectNearby:boolean;
  witnessPresent:boolean;
  manual?:boolean;
};
export function runSpontaneousFork(input:SpontaneousFork){
  const world=createSimulation();
  const passage=world.room('passage','Боковая галерея');
  const gallery=world.room('gallery','Выставочная галерея');
  const storage=world.room('storage','Недоступная кладовая');
  world.connect(passage,gallery,{
    door:{key:'gallery_door',label:'Дверь галереи',open:false}
  });
  const investigator=world.character('investigator','Исследователь',passage);
  const witness=world.character('witness','Свидетель',
    input.witnessPresent?gallery:passage);
  const prankster=world.character('prankster','Шалун',gallery);
  const vase=world.fragileObject('vase','Хрупкая ваза',
    input.objectNearby?gallery:storage);
  world.setGuarded(prankster,true);
  world.setDailyLife(prankster,{
    homeRoom:gallery,diningRoom:gallery,style:'outgoing',interest:'hobbies',
    ...(input.disposition===null?{}:{mischief:input.disposition})
  });
  if(input.manual)world.setManualControl(prankster,true);
  world.setTravelMode(investigator,'unified-30');
  world.setDailyLife(investigator,{
    homeRoom:gallery,diningRoom:gallery,leisureRoom:gallery,
    style:'reserved',interest:'castle',
    intentionPlanning:true,evidenceInquiry:true
  });
  world.setRoutine(investigator,[gallery]);
  const initial={
    objectBroken:world.isBroken(vase),
    investigatorKnowsCulprit:world.beliefs(investigator).length>0,
    worldEvents:world.events().length
  };
  const decisions:Array<{tick:number;actor:string;action:string;ok:boolean}>=[];
  for(let tick=1;tick<=24;tick++)
    for(const entry of world.step())
      decisions.push({tick,
        actor:entry.actor===prankster?'prankster':
          entry.actor===investigator?'investigator':'other',
        action:entry.action.type,ok:entry.result.ok});
  const events=world.events();
  const incident=events.filter(e=>e.type==='object_broken'&&e.target===vase);
  const investigatorBeliefs=world.beliefs(investigator);
  const witnessBeliefs=world.beliefs(witness);
  const inquiry=world.intentionHistory(investigator)
    .filter(goal=>goal.kind==='inquire'&&goal.object===vase);
  return {input,initial,
    outcome:{
      broken:world.isBroken(vase),
      breakEvents:incident.length,
      initiator:incident[0]?.actor===prankster?'prankster':null,
      autonomousBreaks:decisions.filter(a=>
        a.actor==='prankster'&&a.action==='break_object'&&a.ok).length,
      heardCrash:world.observations(investigator).some(o=>o.kind==='heard_crash'),
      sawBreak:world.observations(investigator).some(o=>o.kind==='witnessed_breakage'),
      reachedGallery:world.currentRoom(investigator)===gallery,
      inspectedDamage:world.observations(investigator).some(o=>
        o.kind==='inspected_object'&&o.target===vase&&o.broken),
      investigated:inquiry.length>0,
      questionCount:events.filter(e=>
        e.type==='question_asked'&&e.actor===investigator&&e.object===vase).length,
      sourceAttribution:investigatorBeliefs.some(b=>
        b.claim.culprit===prankster&&b.claim.object===vase&&
        b.evidence.kind==='testimony'&&b.evidence.speaker===witness),
      witnessSaw: witnessBeliefs.some(b=>
        b.claim.culprit===prankster&&b.claim.object===vase&&
        b.evidence.kind==='vision'),
      investigatorKnowsCulprit:investigatorBeliefs.some(b=>
        b.claim.culprit===prankster&&b.claim.object===vase)
    },
    decisions,
    timeline:events.flatMap((e,sequence)=>{
      if(e.type==='object_broken'&&e.target===vase)
        return [{sequence:sequence+1,kind:'spontaneous_incident'}];
      if(e.type==='object_inspected'&&e.actor===investigator&&e.target===vase)
        return [{sequence:sequence+1,kind:e.broken?'damage_confirmed':'intact_confirmed'}];
      if(e.type==='question_asked'&&e.actor===investigator&&e.object===vase)
        return [{sequence:sequence+1,kind:'question'}];
      if(e.type==='testimony_delivered'&&e.listener===investigator&&
         e.claim.object===vase)
        return [{sequence:sequence+1,kind:'testimony'}];
      return [];
    })
  };
}
