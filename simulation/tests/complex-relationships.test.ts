import test from 'node:test';
import assert from 'node:assert/strict';
import {relationshipFromExperience} from '../src/core/relationship-evidence.ts';
import {unresolvedPersonalAbsence,unresolvedPersonalAbsences}
  from '../src/core/personal-outcomes.ts';
import {personallyAvoids} from '../src/core/social-commitments.ts';
import {ownUnrepairedCommitment,considersConcreteRepair}
  from '../src/core/reconciliation.ts';
import {runOpenSocialWorld} from '../src/scenarios/open-social-life.ts';
import type {CommitmentMemory} from '../src/core/social-commitments.ts';

const witnessed=(meetingId:number,kind:CommitmentMemory['kind'],
  minute:number,partner=11,repairOfMeetingId?:number):CommitmentMemory=>({
  meetingId,kind,minute,partner,room:3,purpose:'explore',
  ...(repairOfMeetingId===undefined?{}:{repairOfMeetingId})
});

test('31.9: a concrete kept repair can settle one of two independent grievances',()=>{
  const memories=[
    witnessed(1,'waited_alone',1100),
    witnessed(2,'waited_alone',2600),
    witnessed(3,'offered',4010,11,2),
    witnessed(3,'accepted',4020),
    witnessed(3,'met',5500,11,2)
  ];
  assert.deepEqual(unresolvedPersonalAbsences(memories,11).map(m=>m.meetingId),[1]);
  assert.equal(unresolvedPersonalAbsence(memories,5500,7*1440)?.meetingId,1);
  assert.equal(personallyAvoids(memories,11),true);
  assert.deepEqual(relationshipFromExperience('trusted',memories,11),{
    trust:'neutral',basis:'partial_repair',meetingId:1,minute:1100
  });
  assert.equal(relationshipFromExperience('trusted',memories,12).trust,'trusted',
    'No broadcast of guilt to anyone else');
});

test('31.9: own responsibility is not erased by repairing another obligation',()=>{
  const own=[witnessed(1,'missed_my_promise',1100),
    witnessed(2,'missed_my_promise',2600),
    witnessed(3,'offered',4020,11,2),
    witnessed(3,'met',5500,11,2)];
  assert.equal(ownUnrepairedCommitment(own,5550)?.missedMeetingId,1);
  const observed=[witnessed(1,'waited_alone',1100),
    witnessed(2,'waited_alone',2600),
    witnessed(3,'met',5500,11,2)];
  assert.equal(considersConcreteRepair({personalHistory:observed,partner:11,
    repairOfMeetingId:2,response:'open'}),false,
    'The listener cannot be asked to accept repair for a settled lapse');
  assert.equal(considersConcreteRepair({personalHistory:observed,partner:11,
    repairOfMeetingId:1,response:'open'}),true);
});

test('31.9: mundane attendance addresses at most one outstanding breach',()=>{
  const both=[witnessed(1,'waited_alone',1100),
    witnessed(2,'waited_alone',2600)];
  assert.equal(relationshipFromExperience('trusted',both,11).trust,'neutral');
  const partially=[...both,witnessed(3,'met',4010)];
  assert.deepEqual(unresolvedPersonalAbsences(partially,11).map(m=>m.meetingId),[1]);
  assert.equal(relationshipFromExperience('trusted',partially,11).basis,'partial_repair');
  const fully=[...partially,witnessed(4,'met',5500)];
  assert.equal(personallyAvoids(fully,11),false);
  assert.equal(relationshipFromExperience('trusted',fully,11).trust,'trusted');
  assert.equal(relationshipFromExperience('trusted',fully,11).basis,'kept_after_setback');
  assert.equal(relationshipFromExperience('neutral',fully,11).trust,'neutral',
    'Kept appointments cannot create unrelated friendship');
});

test('31.9: false lineage, mere promises and other people do not absolve old absences',()=>{
  const history=[witnessed(1,'waited_alone',1000),
    witnessed(2,'waited_alone',2000),
    witnessed(3,'met',3000,11,999), // wrong cause, no settlement
    witnessed(4,'met',4000,12),
    witnessed(5,'offered',4100,11,1),
    witnessed(5,'accepted',4200),
    witnessed(5,'declined',4300)];
  assert.deepEqual(unresolvedPersonalAbsences(history,11).map(m=>m.meetingId),[1,2]);
  assert.equal(personallyAvoids(history,11),true);
  assert.equal(personallyAvoids(history,12),false);
  assert.equal(relationshipFromExperience('neutral',history,11).trust,'distrusted');
  assert.equal(unresolvedPersonalAbsence(history,3000,1500)?.meetingId,2);
});

test('31.9: world itself creates two missed promises and one actual, partial repair',()=>{
  const repeated=runOpenSocialWorld('repeat_repair',6);
  const one=runOpenSocialWorld('repair_open',4);
  assert.equal(repeated.summary.expired,2);
  assert.equal(repeated.summary.repairOffers,2);
  assert.equal(repeated.summary.repairKept,1);
  assert.equal(repeated.summary.repairDeclined,0);
  assert.equal(one.summary.repairKept,1);
  assert.equal(one.finalPersonalEvidence.siriusToJames.trust,'trusted');
  const witnessed=repeated.finalPersonalEvidence.siriusWitnessedAbsences;
  assert.equal(witnessed.length,2);
  assert.equal(witnessed[0],1);
  assert.deepEqual(repeated.finalPersonalEvidence.siriusOutstandingMeetingIds,[witnessed[0]]);
  assert.equal(repeated.finalPersonalEvidence.siriusToJames.trust,'neutral');
  assert.equal(repeated.finalPersonalEvidence.siriusToJames.basis,'partial_repair');
  assert.equal(repeated.finalPersonalEvidence.jamesToSirius.trust,'trusted');
  assert.ok(repeated.finalPersonalEvidence.siriusMetMeetings.some(
    m=>m.repairOfMeetingId===witnessed[1]));
  assert.equal(repeated.checkpoint.sameRuntime,true);
  assert.equal(repeated.checkpoint.sameRelationships,true);
});

test('31.9: six-day mixed social history is deterministic on a fresh world',()=>{
  assert.deepEqual(runOpenSocialWorld('repeat_repair',6),
    runOpenSocialWorld('repeat_repair',6));
});
