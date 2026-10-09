/** [GAME] #31.2: first action emerges inside world.step(), never from setup. */
import assert from 'node:assert/strict';
import {runSpontaneousFork} from '../scenarios/spontaneous-incident.ts';
const spontaneous=runSpontaneousFork({
  disposition:'reckless',objectNearby:true,witnessPresent:true
});
const cautious=runSpontaneousFork({
  disposition:'cautious',objectNearby:true,witnessPresent:true
});
const withoutOpportunity=runSpontaneousFork({
  disposition:'reckless',objectNearby:false,witnessPresent:true
});
const cautiousAlone=runSpontaneousFork({
  disposition:'cautious',objectNearby:true,witnessPresent:false
});
assert.equal(spontaneous.initial.worldEvents,0);
assert.equal(spontaneous.outcome.autonomousBreaks,1);
assert.equal(spontaneous.outcome.sourceAttribution,true);
assert.equal(cautious.outcome.autonomousBreaks,0);
assert.equal(withoutOpportunity.outcome.autonomousBreaks,0);
assert.equal(cautiousAlone.outcome.autonomousBreaks,1);
console.log(JSON.stringify({
  experiment:'31.2',classification:'[GAME]',
  method:'NPC decides first break from local opportunity, witness risk and disposition',
  spontaneous,cautious,withoutOpportunity,cautiousAlone,
  caveats:[
    'Mischief disposition is an explicit opt-in character trait, not an emergent personality.',
    'Only a limited breakable-object action is currently eligible; no general motive planner.',
    'The scenario never calls break_object. The normal validated command produces the event.'
  ]
},null,2));
