import test from 'node:test';
import assert from 'node:assert/strict';
import {contextualRelationship,contextualAvoidance} from '../src/core/social-context.ts';
import {runPlayerSocialFork} from '../src/scenarios/player-social-intervention.ts';
import {runOpenSocialWorld} from '../src/scenarios/open-social-life.ts';
import {createTextSession} from '../src/cli/text-game.ts';
import type {CommitmentMemory} from '../src/core/social-commitments.ts';

const remembered=(meetingId:number,kind:CommitmentMemory['kind'],
  purpose:'study'|'explore',minute:number):CommitmentMemory=>({
  meetingId,kind,partner:7,purpose,minute,room:1
});

test('31.10: purpose-specific facts do not contaminate another context',()=>{
  const history=[
    remembered(1,'waited_alone','explore',540),
    remembered(2,'met','study',600)
  ];
  assert.equal(contextualRelationship('trusted',history,7,'explore').trust,'neutral');
  assert.equal(contextualRelationship('trusted',history,7,'study').trust,'trusted');
  assert.equal(contextualAvoidance(history,7,'explore'),true);
  assert.equal(contextualAvoidance(history,7,'study'),false);
  assert.equal(contextualRelationship('neutral',history,7,'study').trust,'neutral');
});

test('31.10: one observed study repair cannot excuse a separate exploration lapse',()=>{
  const history=[
    remembered(1,'waited_alone','study',540),
    remembered(2,'waited_alone','explore',600),
    {...remembered(3,'met','study',720),repairOfMeetingId:1}
  ];
  assert.equal(contextualRelationship('trusted',history,7,'study').trust,'trusted');
  assert.equal(contextualRelationship('trusted',history,7,'explore').trust,'neutral');
  assert.equal(contextualAvoidance(history,7,'explore'),true);
});

test('31.11: a player can choose an offer while an NPC independently consents or refuses',()=>{
  const study=runPlayerSocialFork('study',true);
  const explore=runPlayerSocialFork('explore',true);
  assert.equal(study.firstMeeting,'expired');
  assert.equal(study.npcWitnessedAbsence,true);
  assert.equal(study.playerWitnessedAbsence,false);
  assert.equal(study.playerObservedClassmate,true);
  assert.equal(study.offerAcceptedByExecutor,true);
  assert.equal(study.npcAutonomousAnswer,true);
  assert.equal(study.answer,'pending');
  assert.equal(explore.answer,'declined');
  assert.equal(study.npcTrustForStudy,'trusted');
  assert.equal(study.npcTrustForExploration,'neutral');
  assert.equal(study.npcTrustOverall,'neutral');
  assert.deepEqual(study.playerPrivateMemory,
    ['promised','missed_my_promise']);
});

test('31.11: opt-out preserves original ordinary refusal, no new mandatory behaviour',()=>{
  const optedOut=runPlayerSocialFork('study',false);
  assert.equal(optedOut.answer,'declined');
  assert.equal(optedOut.npcTrustForStudy,'neutral');
  assert.equal(optedOut.npcAutonomousAnswer,true);
});

test('31.11: terminal offers use physical rules and show only the player memory',()=>{
  const session=createTextSession();
  const player=session.world().id('james')!;
  assert.match(session.respond('offer ghost explore'),/Неизвестный/);
  assert.match(session.respond('offer peter explore'),/Предложение сделано/);
  const seen=session.respond('mymeetings');
  assert.match(seen,/peter: offered/);
  assert.match(seen,/accepted|declined/);
  assert.equal(session.world().promiseHistory(player).some(
    m=>m.kind==='waited_alone'),false);
  assert.doesNotMatch(seen,/waited_alone/);
});

test('31.12: materialized checkpoint, independent worlds and repeatability',()=>{
  const one=runPlayerSocialFork('study',true);
  const two=runPlayerSocialFork('study',true);
  assert.deepEqual(one,two);
  assert.equal(one.checkpoint.sameRuntime,true);
  assert.equal(one.checkpoint.sameStudyTrust,true);
  assert.equal(one.checkpoint.sameExploreTrust,true);
  const without=runPlayerSocialFork('explore',true);
  assert.equal(without.checkpoint.sameRuntime,true);
  const open=runOpenSocialWorld('repair_open',4);
  const repeated=runOpenSocialWorld('repeat_repair',6);
  assert.equal(open.summary.repairKept,1);
  assert.equal(repeated.summary.repairKept,1);
  assert.equal(repeated.summary.expired,2);
  assert.deepEqual(repeated.finalPersonalEvidence.siriusOutstandingMeetingIds,[1]);
  assert.equal(open.checkpoint.sameRelationships,true);
  assert.equal(repeated.checkpoint.sameRelationships,true);
  assert.equal(repeated.finalPersonalEvidence.siriusToJames.trust,'neutral');
});
