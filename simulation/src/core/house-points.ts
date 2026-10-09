/**
 * [GAME] House points are institutional decisions, not verified world truth.
 * A witness's testimony may be wrong; the score and personal knowledge differ.
 */
export const HOUSE_IDS=['gryffindor','ravenclaw','hufflepuff','slytherin'] as const;
export type HouseId=typeof HOUSE_IDS[number];
export type PointAuthority='teacher'|'headmaster';
export type PointBasis={kind:'breakage_claim';object:number}|{kind:'observed_merit'};
export type PointEvidence={kind:'vision';object:number}|
  {kind:'testimony';object:number;speaker:number}|{kind:'direct_merit'};
export type PointDecision={id:number;minute:number;actor:number;pupil:number;
  house:HouseId;delta:number;reason:string;evidence:PointEvidence};
export type PointNews={decisionId:number;minute:number;announcer:number;pupil:number;
  house:HouseId;delta:number;reason:string;source:'hearing'|'testimony';speaker?:number};
export type PointReaction={decisionId:number;pupil:number;
  stance:'resentful'|'proud'|'embarrassed';source:PointNews['source']};
export type PointRejection='no_point_authority'|'not_enrolled'|'invalid_points'|
  'invalid_reason'|'missing_evidence'|'wrong_basis'|'duplicate_decision'|
  'unknown_decision'|'news_not_known'|'already_knows'|'not_colocated'|
  'listener_cannot_hear'|'cannot_talk_to_self';
export function isHouseId(value:unknown):value is HouseId{
  return typeof value==='string'&&(HOUSE_IDS as readonly string[]).includes(value);
}
export function calculatePoints(entries:readonly PointDecision[]):Record<HouseId,number>{
  const totals:Record<HouseId,number>={gryffindor:0,ravenclaw:0,hufflepuff:0,slytherin:0};
  for(const entry of entries)totals[entry.house]+=entry.delta;
  return totals;
}
export function respondToNews(actor:number,house:HouseId|undefined,news:PointNews):PointReaction|null{
  if(house!==news.house)return null;
  return {decisionId:news.decisionId,pupil:news.pupil,source:news.source,
    stance:news.delta>0?'proud':actor===news.pupil?'embarrassed':'resentful'};
}
