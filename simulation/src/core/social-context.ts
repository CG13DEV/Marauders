/**
 * [GAME] #31.10: contextual reliability is a VIEW of personally lived
 * commitments, not an extra social variable. A missed exploration appointment
 * need not imply somebody is unreliable for studying together.
 *
 * This is narrowly about study/explore meeting reliability. It DOES NOT claim
 * secret-keeping, courage, kindness, emergency rescue, or psychological insight.
 */
import type {Trust} from './cognition.ts';
import type {CommitmentMemory,MeetingPurpose} from './social-commitments.ts';
import {relationshipFromExperience,type RelationshipEvidence} from './relationship-evidence.ts';
import {unresolvedPersonalAbsences} from './personal-outcomes.ts';

export function contextualRelationship(
  baseline:Trust,history:readonly CommitmentMemory[],
  partner:number,purpose:MeetingPurpose
):RelationshipEvidence{
  return relationshipFromExperience(baseline,
    history.filter(m=>m.purpose===purpose),partner);
}

export function contextualAvoidance(
  history:readonly CommitmentMemory[],partner:number,purpose:MeetingPurpose
):boolean{
  return unresolvedPersonalAbsences(
    history.filter(m=>m.purpose===purpose),partner).length>0;
}
