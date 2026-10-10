/** [GAME] 31.9 — repeated breaches, independently repaired evidence. */
import assert from 'node:assert/strict';
import {runOpenSocialWorld} from '../scenarios/open-social-life.ts';
const repeated=runOpenSocialWorld('repeat_repair',6);
const repaired=runOpenSocialWorld('repair_open',4);
assert.equal(repeated.summary.expired,2);
assert.equal(repeated.summary.repairKept,1);
assert.equal(repeated.finalPersonalEvidence.siriusToJames.trust,'neutral');
assert.equal(repeated.finalPersonalEvidence.siriusToJames.basis,'partial_repair');
assert.equal(repaired.finalPersonalEvidence.siriusToJames.trust,'trusted');
for(const world of [repeated,repaired]){
  assert.equal(world.checkpoint.sameRuntime,true);
  assert.equal(world.checkpoint.sameRelationships,true);
}
console.log(JSON.stringify({
  experiment:'31.9',classification:'[GAME]',
  setup:'Six autonomous days: two competing school duties and an independent concrete repair',
  runs:[repeated,repaired].map(x=>({
    variant:x.variant,days:x.days,summary:x.summary,
    personalEvidence:x.finalPersonalEvidence,
    snapshots:x.conflictSnapshots,
    repairInitiatives:x.trace.filter(t=>t.repairOfMeetingId!==undefined),
    checkpoint:x.checkpoint
  })),
  interpretation:'One actually fulfilled follow-up repairs only its evidenced cause; an earlier independent grievance remains first-person knowledge.',
  limits:'Same-domain social promises only. No generic forgiveness, importance weighting, crisis rescue or numerical friendship score.'
},null,2));
