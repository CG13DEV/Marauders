/**
 * [GAME] G4.5: research emerges from personal curiosity and lived education.
 * No "scientist" tag, globally revealed laboratory, personality dice or
 * quest-giver. The only room this function can propose is a room the actor
 * actually attended in their own timetable.
 */
import type {DailyLifePlan} from './daily-life.ts';
import type {AttendanceRecord} from './school-time.ts';
import type {SpellStage} from './spellcraft.ts';
import type {MagicPrimitive} from './magic-graph.ts';
import type {MagicHypothesis,PendingMagicTrial} from './magic-research.ts';
import {isResearchTime} from './autonomous-magic-research.ts';

export type PersonalMagicInitiative={
  spell:'wingardium_leviosa';
  room:number;
  preferred:'position_lock'|'force_feedback';
};

/** Knowledge alone doesn't force everyone to do research. */
export function personalMagicResearchInitiative(input:{
  plan:DailyLifePlan;
  lessons:readonly AttendanceRecord[];
  stage:SpellStage;
  learned:readonly MagicPrimitive[];
  notes:readonly MagicHypothesis[];
  pending:PendingMagicTrial|null;
  minute:number;
}):PersonalMagicInitiative|null{
  const {plan,lessons,stage,learned,notes,pending,minute}=input;
  if(!plan.intentionPlanning || !isResearchTime(minute) ||
     stage==='unaware'||stage==='conceptual'||learned.length===0)return null;

  // Intellectual inclinations are already part of the character's life.
  // A castle explorer remains an explorer until evidence/motives change.
  if(plan.interest!=='lessons'&&plan.interest!=='hobbies')return null;
  const attended=lessons.find(lesson=>
    lesson.spell==='wingardium_leviosa'&&
    (lesson.status==='late'||lesson.status==='on_time')&&
    lesson.arrivedAt!==undefined&&lesson.arrivedAt<=minute);
  if(!attended)return null;

  const available=learned.filter(x=>x==='position_lock'||x==='force_feedback');
  if(available.length===0)return null;
  // A tinkerer seeks a *responsive*, dynamic control experiment. Merely
  // memorizing the static position lock does not yet tempt that pupil into
  // the laboratory. An academic-minded learner may investigate earlier.
  if(plan.interest==='hobbies'&&!available.includes('force_feedback'))
    return null;
  // The personally observed room, not omniscient world topology.
  const preferred=plan.interest==='hobbies'?'force_feedback':'position_lock';
  const studied=new Set(notes.flatMap(h=>h.pattern.nodes
    .filter(n=>n.kind==='levitate')
    .map(n=>n.kind==='levitate'?n.controller:null)));
  if(!pending && !notes.some(h=>h.spell==='wingardium_leviosa'&&h.trials.length===0) &&
     available.every(p=>studied.has(p)))return null;
  return {spell:'wingardium_leviosa',room:attended.room,preferred};
}
