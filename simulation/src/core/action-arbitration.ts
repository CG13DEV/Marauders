/**
 * [GAME] R3: multiple independent local policies suggest one action.
 * A physical social opportunity takes precedence over optional mischief
 * when both are present; neither policy may execute before arbitration.
 * This is an explicit qualitative order, not a global RPG score.
 */
import type {SocialResponse} from './social-choice.ts';

export type CandidateAction=
  |{kind:'social';response:Exclude<SocialResponse,{kind:'idle'}>}
  |{kind:'mischief';target:number};

export function arbitrateAutonomousAction(input:{
  social?:SocialResponse|null;
  mischiefTarget?:number|null;
}):CandidateAction|null{
  if(input.social?.kind==='chat'||input.social?.kind==='leave')
    return {kind:'social',response:input.social};
  if(input.mischiefTarget!==undefined&&input.mischiefTarget!==null)
    return {kind:'mischief',target:input.mischiefTarget};
  return null;
}
