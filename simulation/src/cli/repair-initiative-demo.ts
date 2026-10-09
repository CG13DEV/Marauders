/** [GAME] #31.8 independent attempted repair; never scripted forgiveness. */
import assert from 'node:assert/strict';
import {runOpenSocialWorld} from '../scenarios/open-social-life.ts';
const open=runOpenSocialWorld('repair_open',4);
const guarded=runOpenSocialWorld('repair_guarded',4);
const noLapse=runOpenSocialWorld('repair_unneeded',4);
assert.equal(open.summary.repairKept,1);
assert.equal(guarded.summary.repairDeclined,1);
assert.equal(noLapse.summary.repairOffers,0);
for(const world of [open,guarded,noLapse]){
  assert.equal(world.checkpoint.sameRuntime,true);
  assert.equal(world.checkpoint.sameRelationships,true);
}
console.log(JSON.stringify({
  experiment:'31.8',classification:'[GAME]',
  setup:'Four simulated days, four residents; conflicting lesson only configured at world creation',
  forks:[open,guarded,noLapse].map(x=>({
    name:x.variant,days:x.days,initial:x.initial,
    summary:x.summary,checkpoints:x.checkpoint,
    personalSnapshots:x.conflictSnapshots,
    amends:x.trace.filter(t=>t.repairOfMeetingId!==undefined),
    relatedEvents:x.events.filter(e=>e.repairOfMeetingId!==undefined||
      e.type==='meeting_answered'||e.type==='meeting_resolved')
      .slice(0,24)
  })),
  evidenceLimits:[
    'No omniscient awareness of whether another person waited.',
    'The promisor infers only their own missed commitment from firsthand evidence.',
    'A refused offer cannot change trust.',
    'An offer or conversation alone does not restore trust; kept physical meeting does.',
    'Acceptance is a qualitative opt-in choice, not an RPG emotion meter.'
  ]
},null,2));
