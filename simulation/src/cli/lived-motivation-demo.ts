/** [GAME] #31.3: personally lived events alter future NPC action. */
import assert from 'node:assert/strict';
import {runLivedMotivationFork} from '../scenarios/lived-motivation.ts';
const waited=runLivedMotivationFork('waited_alone');
const kept=runLivedMotivationFork('kept');
const bothAbsent=runLivedMotivationFork('both_absent');
const noPromise=runLivedMotivationFork('no_promise');
assert.equal(waited.atResolution.memory.includes('waited_alone'),true);
assert.equal(waited.outcome.spontaneousBreaks,1);
assert.equal(kept.outcome.spontaneousBreaks,0);
assert.equal(bothAbsent.outcome.spontaneousBreaks,0);
assert.equal(noPromise.outcome.spontaneousBreaks,0);
console.log(JSON.stringify({
  experiment:'31.3',classification:'[GAME]',
  method:'Same personality, place and opportunity; change only personally lived meeting outcome',
  waited,kept,bothAbsent,noPromise,
  caveats:[
    'Reactive disposition is still designer-selected; only its trigger emerges from autobiographical memory.',
    'The behavioral response is bounded and not a universal model of anger, ethics or intent.',
    'A missed appointment without firsthand waiting produces no invented grievance.'
  ]
},null,2));
