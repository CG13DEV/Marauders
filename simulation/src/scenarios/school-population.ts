/**
 * [GAME] Research cohort for a roughly 600-pupil school.
 * These are NOT canonical 1971 enrolment figures or identified characters.
 * Explicit demographics are stable across saves, runs, and tests.
 */
import {HOUSES,type House} from './curriculum.ts';

export const SIX_HUNDRED_COHORTS:Readonly<Record<House,readonly number[]>>={
  gryffindor:[22,20,23,21,22,20,22],
  ravenclaw:[21,22,20,23,21,22,21],
  hufflepuff:[23,21,22,20,22,21,21],
  slytherin:[20,23,21,22,20,22,22]
};
export const RESEARCH_SCHOOL_POPULATION=600;
export const RESEARCH_DORM_CAPACITY=5;

/** Selection is by year and house, not by anonymous array position. */
export function cohortSize(house:House,year:number):number{
  if(!Number.isSafeInteger(year)||year<1||year>7)
    throw new Error('Invalid school year');
  return SIX_HUNDRED_COHORTS[house][year-1]!;
}

export function populationSummary(){
  const houses=Object.fromEntries(HOUSES.map(h=>[
    h,SIX_HUNDRED_COHORTS[h].reduce((sum,n)=>sum+n,0)
  ])) as Record<House,number>;
  const years=Array.from({length:7},(_,y)=>
    HOUSES.reduce((n,h)=>n+SIX_HUNDRED_COHORTS[h][y]!,0));
  const total=Object.values(houses).reduce((n,x)=>n+x,0);
  if(total!==RESEARCH_SCHOOL_POPULATION)throw new Error('Cohort population mismatch');
  return {total,houses,years};
}

/** Synthetic dorm sex split; no real person's sex/gender is inferred. */
export function dormGroupFor(index:number):'boys'|'girls'{
  return index%2===0?'boys':'girls';
}
