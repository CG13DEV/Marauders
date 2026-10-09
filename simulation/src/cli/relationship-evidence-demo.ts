/** [GAME] Experiment #31.5: directed relationships, firsthand evidence. */
import assert from 'node:assert/strict';
import {runRelationshipFork} from '../scenarios/relationship-evidence.ts';
const broken=runRelationshipFork('broken');
const repaired=runRelationshipFork('repaired');
const kept=runRelationshipFork('kept');
const noWitness=runRelationshipFork('both_absent');
const disabled=runRelationshipFork('broken',{optIn:false});
assert.equal(broken.afterOpportunity.actual.trust,'neutral');
assert.deepEqual(broken.final.spokenTo,['companion']);
assert.equal(repaired.afterOpportunity.actual.trust,'trusted');
assert.deepEqual(repaired.final.spokenTo,['friend']);
assert.equal(kept.afterOpportunity.actual.trust,'trusted');
assert.equal(noWitness.afterOpportunity.actual.trust,'trusted');
assert.equal(disabled.afterOpportunity.actual.trust,'trusted');
assert.deepEqual(broken.checkpoint.storedTrusts,broken.checkpoint.restoredTrusts);
console.log(JSON.stringify({
  experiment:'31.5',classification:'[GAME]',
  method:'Same future scene and baseline relationship; factual, first-person meeting evidence changes later choice',
  broken,repaired,kept,noWitness,disabled,
  limits:[
    'Attitude is derived from personal memories; no independent friendship meter.',
    'A successful NEW appointment resolves this particular setback; generic conversation does not.',
    'Evidence affects only the observer, never a remote NPC mind or a global relationship.'
  ]
},null,2));
