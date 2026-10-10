/** [GAME] 31.10–31.12: purpose reliability, player agency, integration gates. */
import assert from 'node:assert/strict';
import {runPlayerSocialFork} from '../scenarios/player-social-intervention.ts';
import {runOpenSocialWorld} from '../scenarios/open-social-life.ts';
const study=runPlayerSocialFork('study',true);
const explore=runPlayerSocialFork('explore',true);
const legacy=runPlayerSocialFork('study',false);
const open=runOpenSocialWorld('repair_open',4);
const complex=runOpenSocialWorld('repeat_repair',6);
assert.equal(study.answer,'pending');
assert.equal(explore.answer,'declined');
assert.equal(legacy.answer,'declined');
assert.equal(study.npcTrustForStudy,'trusted');
assert.equal(study.npcTrustForExploration,'neutral');
assert.equal(open.summary.repairKept,1);
assert.deepEqual(complex.finalPersonalEvidence.siriusOutstandingMeetingIds,[1]);
assert.equal(complex.checkpoint.sameRelationships,true);
for(const x of [study,explore,legacy]){
  assert.equal(x.checkpoint.sameRuntime,true);
  assert.equal(x.checkpoint.sameStudyTrust,true);
  assert.equal(x.checkpoint.sameExploreTrust,true);
}
console.log(JSON.stringify({
  experiments:['31.10','31.11','31.12'],
  classification:'[GAME]',
  contextual:{study,explore,legacy},
  integration:{singleRepair:open.summary,complexHistory:complex.summary,
    oldCheckpoint:open.checkpoint,newCheckpoint:complex.checkpoint},
  limits:'Only appointment reliability for study/explore. No secrecy/reputation, crisis rescue, simulated internal emotion, or full interactive 3D vertical slice.'
},null,2));
