/**
 * [GAME] #31.4: choose among ordinary, non-destructive opportunities.
 * Uses only first-person history, directed trust, and current local company.
 * A chat is an attempt to connect, NOT a magically resolved grievance.
 */
import type {CommitmentMemory} from './social-commitments.ts';
import type {Trust} from './cognition.ts';
import {livedMischiefMotive} from './mischief.ts';

export type SocialResponse =
  | {kind:'chat';listener:number;reason:'reconnect'|'other_company'|'habit'}
  | {kind:'leave';destination:number;reason:'avoidance'}
  | {kind:'idle';reason:'no_opportunity'};

export function chooseSocialResponse(input:{
  actor:number;
  minute:number;
  history:readonly CommitmentMemory[];
  people:readonly number[];
  trust:(person:number)=>Trust;
  knownExits:readonly number[];
}):SocialResponse {
  const {actor,minute,history,people,trust,knownExits}=input;
  const local=[...new Set(people)].filter(p=>p!==actor).sort((a,b)=>a-b);
  const rank=(t:Trust)=>t==='trusted'?2:t==='neutral'?1:0;
  const alternatives=(excluded?:number)=>local
    .filter(p=>p!==excluded&&trust(p)!=='distrusted')
    .sort((a,b)=>rank(trust(b))-rank(trust(a))||a-b);
  const grievance=livedMischiefMotive(history,minute);
  if(grievance){
    if(local.includes(grievance.partner)&&trust(grievance.partner)==='trusted')
      return {kind:'chat',listener:grievance.partner,reason:'reconnect'};
    const other=alternatives(grievance.partner)[0];
    if(other!==undefined)
      return {kind:'chat',listener:other,reason:'other_company'};
    const exit=[...new Set(knownExits)].sort((a,b)=>a-b)[0];
    return exit===undefined
      ?{kind:'idle',reason:'no_opportunity'}
      :{kind:'leave',destination:exit,reason:'avoidance'};
  }
  // A personally recorded successful meeting is a concrete reason to speak
  // again, but neither friendship nor another person's mood is inferred.
  const reunited=[...history].reverse().find(m=>m.kind==='met'&&
    local.includes(m.partner)&&trust(m.partner)!=='distrusted');
  if(reunited)return {kind:'chat',listener:reunited.partner,reason:'habit'};
  const other=alternatives()[0];
  return other===undefined?{kind:'idle',reason:'no_opportunity'}
    :{kind:'chat',listener:other,reason:'habit'};
}
