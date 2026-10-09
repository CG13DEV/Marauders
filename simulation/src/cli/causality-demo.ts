/** [GAME] #31.1: report counterfactual causal autonomy with no special plot script. */
import assert from 'node:assert/strict';
import {runCausalFork} from '../scenarios/causal-counterfactual.ts';

const incident=runCausalFork({damage:true,witnessCanSee:true});
const noIncident=runCausalFork({damage:false,witnessCanSee:true});
const noEyewitness=runCausalFork({damage:true,witnessCanSee:false});
assert.ok(incident.outcome.knownCulprit&&
  incident.outcome.attribution.some(a=>a.speaker==='witness'));
assert.ok(!noIncident.outcome.investigated&&!noIncident.outcome.knownCulprit);
assert.ok(noEyewitness.outcome.investigated&&!noEyewitness.outcome.knownCulprit);
console.log(JSON.stringify({
  experiment:'31.1',
  classification:'[GAME]',
  method:'Same actor schedules, routes and rules; remove only incident or eyewitness vision',
  incident, noIncident, noEyewitness,
  caveats:[
    'Exogenous breakage is a test intervention, NOT autonomously chosen by culprit.',
    'A deterministic incident-to-belief chain is not proof of free-form plotting.',
    'NPC cognition uses only local observations and attributed testimony.'
  ]
},null,2));
