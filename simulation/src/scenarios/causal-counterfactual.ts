/**
 * [GAME] #31.1 counterfactual causal chain, using only existing world rules.
 * One exogenous incident is toggled; subsequent choices come from NPC policy.
 * Do not read authoritative event history to decide any character action.
 */
import {createSimulation} from '../core/Simulation.ts';

export type CausalFork = {
  damage:boolean;
  witnessCanSee:boolean;
};
export function runCausalFork(input:CausalFork){
  const world=createSimulation();
  const passage=world.room('passage','Боковая галерея');
  const gallery=world.room('gallery','Выставочная галерея');
  // Closed door transmits noise but blocks line of sight. It must be
  // opened through the same authoritative travel mechanics as in the game.
  world.connect(passage,gallery,{door:{key:'gallery_door',label:'Дверь галереи',open:false}});
  const investigator=world.character('investigator','Исследователь',passage);
  const witness=world.character('witness','Свидетель',gallery,
    {vision:input.witnessCanSee,hearing:true});
  const culprit=world.character('culprit','Нарушитель',gallery);
  const vase=world.fragileObject('vase','Хрупкая ваза',gallery);

  // A cautious culprit is allowed to withhold a self-incriminating answer.
  // The investigator is not told the incident, culprit or witnesses.
  world.setGuarded(culprit,true);
  world.setTravelMode(investigator,'unified-30');
  world.setDailyLife(investigator,{
    homeRoom:gallery,diningRoom:gallery,leisureRoom:gallery,
    style:'reserved',interest:'castle',
    intentionPlanning:true,evidenceInquiry:true
  });
  // The same ordinary visit is planned in ALL worlds, even without damage.
  world.setRoutine(investigator,[gallery]);

  if(input.damage){
    const attempt=world.execute({type:'break_object',actor:culprit,target:vase});
    if(!attempt.ok)throw Error('Initial physical incident was rejected');
  }

  const initial={
    witnessedByWitness:world.beliefs(witness).some(b=>
      b.evidence.kind==='vision'&&b.claim.culprit===culprit&&
      b.claim.object===vase),
    investigatorHeardCrash:world.observations(investigator).some(o=>
      o.kind==='heard_crash'),
    investigatorKnowsCulprit:world.beliefs(investigator).length>0
  };
  const actions: {tick:number;actor:string;action:string;ok:boolean}[]=[];
  for(let tick=1;tick<=24;tick++){
    for(const decision of world.step()){
      if(decision.actor===investigator)
        actions.push({tick,actor:'investigator',action:decision.action.type,
          ok:decision.result.ok});
    }
  }
  const events=world.events();
  const observations=world.observations(investigator);
  const beliefs=world.beliefs(investigator);
  const goals=world.intentionHistory(investigator);
  const questions=events.filter(e=>
    e.type==='question_asked'&&e.actor===investigator&&e.object===vase);
  const testimony=events.filter(e=>
    e.type==='testimony_delivered'&&e.listener===investigator&&
    e.claim.object===vase);
  const inspections=events.filter(e=>
    e.type==='object_inspected'&&e.actor===investigator&&e.target===vase);
  const inspectedDamage=observations.some(o=>
    o.kind==='inspected_object'&&o.target===vase&&o.broken);
  const inquiryGoals=goals.filter(g=>g.kind==='inquire'&&g.object===vase);
  const attribution=beliefs.filter(b=>b.claim.object===vase).map(b=>({
    culprit:b.claim.culprit===culprit?'culprit':'other',
    evidence:b.evidence.kind,
    speaker:b.evidence.kind==='testimony'
      ?b.evidence.speaker===witness?'witness':b.evidence.speaker===culprit
        ?'culprit':'other':null
  }));
  // Trace is observational only; no NPC uses the full world event log.
  const timeline=events.flatMap((e,index)=>{
    if(e.type==='object_broken'&&e.target===vase)return [{
      sequence:index+1,kind:'incident',actor:'culprit'}];
    if(e.type==='entity_moved'&&e.actor===investigator)return [{
      sequence:index+1,kind:'investigator_moved',actor:'investigator'}];
    if(e.type==='object_inspected'&&e.actor===investigator&&e.target===vase)
      return [{sequence:index+1,kind:e.broken?'found_damage':'found_intact',
        actor:'investigator'}];
    if(e.type==='intention_changed'&&e.actor===investigator)return [{
      sequence:index+1,kind:'goal_'+e.status,actor:'investigator'}];
    if(e.type==='question_asked'&&e.actor===investigator)return [{
      sequence:index+1,kind:e.answered?'question_answered':'question_unanswered',
      actor:'investigator'}];
    if(e.type==='testimony_delivered'&&e.listener===investigator)return [{
      sequence:index+1,kind:'testimony',actor:'witness_or_culprit'}];
    return [];
  });
  return {
    input,initial,
    outcome:{
      physicallyReachedGallery:world.currentRoom(investigator)===gallery,
      inspectedDamage,
      inspectedIntact:inspections.some(e=>e.type==='object_inspected'&&!e.broken),
      investigated:inquiryGoals.length>0,
      inquiryStatuses:inquiryGoals.map(g=>g.status),
      questionCount:questions.length,
      answeredQuestions:questions.filter(e=>
        e.type==='question_asked'&&e.answered).length,
      testimonyCount:testimony.length,
      attribution,
      personallySawIncident:observations.some(o=>o.kind==='witnessed_breakage'),
      witnessedClaim:world.beliefs(witness).some(b=>
        b.evidence.kind==='vision'&&b.claim.object===vase),
      knownCulprit:beliefs.some(b=>b.claim.culprit===culprit&&b.claim.object===vase),
      successfulVisits:actions.filter(a=>a.action==='move'&&a.ok).length
    },
    timeline,actions
  };
}
