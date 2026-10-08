/**
 * [GAME] Experiment #18 — durable personal intentions and bodily constraints.
 * A need is a causal signal, not a gamified hunger/energy health bar.
 * One ten-minute tick; all numbers are deliberately provisional test values.
 */
import type { MealKind } from './daily-life.ts';
import type { SpellId } from './spellcraft.ts';
import { isSleepTime, mealAt } from './daily-life.ts';

export type IntentionImportance='casual'|'important';
export type IntentionStatus='queued'|'active'|'paused'|'completed'|'expired'|'cancelled';
export type Interruption='lesson'|'promise'|'manual'|'hunger'|'fatigue'|'higher_priority';
export type PersonalIntention={
  id:number;
  kind:'visit'|'learn_concept'|'attend_meeting'|'investigate';
  /** Visit destination; for other kinds, only a personally disclosed or physically perceived room. */
  destination:number;
  spell?:SpellId;
  meetingId?:number;
  object?:number;
  importance:IntentionImportance;
  createdMinute:number;
  deadlineMinute?:number;
  status:IntentionStatus;
  interruptedBy?:Interruption;
};
export type BodilyNeeds={ hunger:number; fatigue:number };
export const INITIAL_NEEDS:Readonly<BodilyNeeds>={hunger:26,fatigue:0};

export function advanceNeeds(
  previous:Readonly<BodilyNeeds>,atHome:boolean,minute:number
):BodilyNeeds {
  // Proper sleep is sustained presence at home during sleeping hours.
  // Fatigue also recovers from an emergency daytime rest when exhausted.
  const resting=atHome&&(isSleepTime(minute)||previous.fatigue>=90);
  return {
    hunger:Math.min(100,previous.hunger+1),
    fatigue:resting
      ? Math.max(0,previous.fatigue-4)
      : Math.min(100,previous.fatigue+1)
  };
}
export function afterMeal(previous:Readonly<BodilyNeeds>):BodilyNeeds {
  return {...previous,hunger:Math.max(0,previous.hunger-42)};
}
export function isOpenIntention(goal:PersonalIntention):boolean {
  return goal.status==='queued'||goal.status==='active'||goal.status==='paused';
}
export function pickIntention(goals:readonly PersonalIntention[]):PersonalIntention|null {
  return [...goals].filter(isOpenIntention)
    .sort((a,b)=>
      Number(b.importance==='important')-Number(a.importance==='important') ||
      (a.deadlineMinute??Infinity)-(b.deadlineMinute??Infinity) ||
      a.id-b.id)[0]??null;
}
export type Choice=
  | {kind:'eat'; meal:MealKind; reason:'hunger'}
  | {kind:'rest'; reason:'fatigue'}
  | {kind:'visit'; intention:PersonalIntention}
  | {kind:'pursue'; intention:PersonalIntention}
  | {kind:'idle'};

export function chooseNeedOrIntention(
  needs:Readonly<BodilyNeeds>,minute:number,
  intentions:readonly PersonalIntention[],
  alreadyEaten:(meal:MealKind)=>boolean
):Choice {
  const goal=pickIntention(intentions);
  const hungry=needs.hunger>=24;
  const meal=mealAt(minute);
  const eatingAvailable=meal!==null&&!alreadyEaten(meal);
  // Genuine hunger can interrupt casual curiosity; stronger priorities may
  // defer dinner until hunger becomes urgent. No food appears after closing.
  if(eatingAvailable&&hungry&&
      (needs.hunger>=60||goal?.importance!=='important'))
    return {kind:'eat',meal:meal!,reason:'hunger'};
  // A personal mission can cost sleep, but an exhausted person eventually
  // abandons optional work. This is a consequence, not a magic prohibition.
  if((isSleepTime(minute) &&
      (goal?.importance!=='important'||needs.fatigue>=85)) ||
      needs.fatigue>=95)
    return {kind:'rest',reason:'fatigue'};
  if(goal)return {kind:goal.kind==='visit'?'visit':'pursue',intention:goal};
  return {kind:'idle'};
}
