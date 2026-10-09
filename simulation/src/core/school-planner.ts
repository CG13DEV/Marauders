/**
 * [GAME] Deterministic travel-time estimates for the school timetable.
 * Estimated time = shortest public-graph hop count × one 10-minute tick.
 * We do not use other characters' positions, event history or hidden thoughts.
 *
 * This is a provisional navigation model, NOT personal map knowledge.
 */
import { MINUTES_PER_TICK, type AttendanceRecord } from './school-time.ts';
import {shortestWeightedRoute} from './weighted-navigation.ts';
import {
  ateMeal, dayOf, type MealKind, type MealMemory
} from './daily-life.ts';

type Exits = (room: number) => readonly number[];
type Lesson = AttendanceRecord;

export type ScheduledJourney = {
  lesson: Lesson;
  hops: number | null;
  departAt: number | null;
  committed: boolean;
  inClass: boolean;
};

export type PlannedMeal = {
  kind: MealKind;
  /** Including arrival and one tick to consume the meal. */
  eatingAt: number;
  hops: number;
  feasible: boolean;
};

const MEALS: readonly {kind: MealKind; start: number; end: number}[] = [
  {kind: 'breakfast', start: 8*60, end: 8*60+40},
  {kind: 'lunch', start: 12*60, end: 12*60+50},
  {kind: 'dinner', start: 18*60, end: 19*60}
];

/** Structural BFS distance; unavailable routes are never treated as zero cost. */
export function shortestHops(start: number, goal: number, exits: Exits): number | null {
  if (start === goal) return 0;
  const visited = new Set([start]);
  const queue: {room: number; length: number}[] = [{room:start,length:0}];
  for(let index=0;index<queue.length;index++){
    const node=queue[index]!;
    for(const next of exits(node.room)){
      if(visited.has(next)) continue;
      if(next===goal) return node.length+1;
      visited.add(next);
      queue.push({room:next,length:node.length+1});
    }
  }
  return null;
}

export function nextSchoolJourney(
  lessons: readonly Lesson[],
  minute: number,
  location: number,
  exits: Exits,
  bufferMinutes = MINUTES_PER_TICK,
  minutesPerHop = MINUTES_PER_TICK
): ScheduledJourney | null {
  if(!Number.isSafeInteger(minutesPerHop)||minutesPerHop<1||
     minutesPerHop>MINUTES_PER_TICK)
    throw Error('Invalid passage time');
  const lesson=lessons.find(lesson => minute < lesson.endsAt);
  if(!lesson) return null;
  const hops=shortestHops(location,lesson.room,exits);
  // A single movement starts at this tick; arrival is registered at its end.
  const departAt=hops===null ? null :
    lesson.startsAt - hops*minutesPerHop - bufferMinutes;
  const inClass=minute>=lesson.startsAt && minute<lesson.endsAt;
  return {
    lesson,hops,departAt,
    inClass,
    committed: inClass || (departAt!==null && minute>=departAt)
  };
}

/** Actual time-optimal estimate from the actor's known weighted network. */
export function nextWeightedSchoolJourney(
  lessons:readonly Lesson[],
  minute:number,location:number,
  knownExits:(room:number)=>readonly number[],
  passageMinutes:(from:number,to:number)=>number|null,
  bufferMinutes=MINUTES_PER_TICK
):ScheduledJourney|null{
  const lesson=lessons.find(l=>minute<l.endsAt);
  if(!lesson)return null;
  const route=shortestWeightedRoute(location,lesson.room,knownExits,passageMinutes);
  const departAt=route===null?null:
    lesson.startsAt-route.minutes-bufferMinutes;
  const inClass=minute>=lesson.startsAt&&minute<lesson.endsAt;
  return {lesson,hops:route?.hops??null,departAt,inClass,
    committed:inClass||(departAt!==null&&minute>=departAt)};
}

/**
 * Find a reachable meal (including *pre-window* approach) whose cost still
 * leaves enough time for the nearest scheduled class. Never invent a meal:
 * ingestion remains the validated eat_meal command in its actual room/window.
 */
export function feasibleMealJourney(
  minute: number,
  room: number,
  diningRoom: number,
  meals: readonly MealMemory[],
  nextLesson: Lesson | null,
  exits: Exits,
  /** Optional personally known weighted route duration, used in #30. */
  travelMinutes?:(from:number,to:number)=>number|null
): PlannedMeal | null {
  const day=dayOf(minute);
  for (const meal of MEALS) {
    if (ateMeal(meals,day,meal.kind)) continue;
    const begin=day*1440+meal.start;
    const finish=day*1440+meal.end;
    const hops=shortestHops(room,diningRoom,exits);
    if(hops===null)continue;
    const approachCost=travelMinutes
      ?travelMinutes(room,diningRoom):hops*MINUTES_PER_TICK;
    if(approachCost===null)continue;
    // School time remains quantized to ticks. Arrival is conservatively
    // rounded UP to the next attendance tick; never invent an early meal.
    const approachTicks=travelMinutes
      ?Math.ceil(approachCost/MINUTES_PER_TICK)*MINUTES_PER_TICK:approachCost;
    const eatingAt=Math.max(begin,minute+approachTicks);
    if (eatingAt>=finish) continue;
    // Don't go across the castle hours early; instead start a just-in-time trip.
    const approachAt=begin-approachTicks;
    if(minute<approachAt || minute>=finish) continue;

    if(nextLesson && minute<nextLesson.endsAt) {
      // The session has already started: leaving is never an implicit choice.
      if(minute>=nextLesson.startsAt) continue;
      const afterMealHops=shortestHops(diningRoom,nextLesson.room,exits);
      if(afterMealHops===null)continue;
      const nextCost=travelMinutes
        ?travelMinutes(diningRoom,nextLesson.room):afterMealHops*MINUTES_PER_TICK;
      if(nextCost===null)continue;
      // Eating consumes a subsequent tick; rounding never permits magical
      // fractional arrival at a ten-minute academic boundary.
      const freeToMove=eatingAt+MINUTES_PER_TICK;
      if(freeToMove+Math.ceil(nextCost/MINUTES_PER_TICK)*MINUTES_PER_TICK
         >nextLesson.startsAt)continue;
    }
    return {kind:meal.kind,eatingAt,hops,feasible:true};
  }
  return null;
}
