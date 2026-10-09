import test from 'node:test';
import assert from 'node:assert/strict';
import {relationshipFromExperience} from '../src/core/relationship-evidence.ts';
import {runRelationshipFork} from '../src/scenarios/relationship-evidence.ts';

const pair={partner:11,meetingId:1,minute:1130,room:3,
  purpose:'explore' as const};

test('#31.5: firsthand absence changes directed trust and next voluntary choice',()=>{
  const missed=runRelationshipFork('broken');
  assert.equal(missed.firstResult.status,'expired');
  assert.equal(missed.firstResult.relationship.trust,'neutral');
  assert.equal(missed.firstResult.relationship.basis,'waited_alone');
  assert.equal(missed.firstResult.oppositeTrust,'neutral');
  assert.equal(missed.afterOpportunity.baseline,'trusted');
  assert.equal(missed.afterOpportunity.actual.trust,'neutral');
  assert.deepEqual(missed.final.spokenTo,['companion']);
  assert.equal(missed.final.friendTrust,'neutral');
  assert.equal(missed.final.noFabricatedReconciliation,true);
  assert.equal(missed.final.incidents,0);
});

test('#31.5: kept new promise repairs evidence, not an ordinary chat',()=>{
  const repaired=runRelationshipFork('repaired');
  const broken=runRelationshipFork('broken');
  assert.deepEqual({
    minute:repaired.afterOpportunity.minute,
    pupil:repaired.afterOpportunity.pupilHere,
    friend:repaired.afterOpportunity.friendHere,
    companion:repaired.afterOpportunity.companionHere,
    baseline:repaired.afterOpportunity.baseline
  },{
    minute:broken.afterOpportunity.minute,
    pupil:broken.afterOpportunity.pupilHere,
    friend:broken.afterOpportunity.friendHere,
    companion:broken.afterOpportunity.companionHere,
    baseline:broken.afterOpportunity.baseline
  });
  assert.equal(repaired.firstResult.relationship.trust,'neutral');
  assert.equal(repaired.afterOpportunity.actual.trust,'trusted');
  assert.equal(repaired.afterOpportunity.actual.basis,'kept_after_setback');
  assert.deepEqual(repaired.afterOpportunity.meetingStatuses,['expired','kept']);
  assert.deepEqual(repaired.final.spokenTo,['friend']);
  assert.equal(broken.afterOpportunity.actual.trust,'neutral');
  assert.deepEqual(broken.final.spokenTo,['companion']);
});

test('#31.5: successful, unwitnessed and absent promises do not invent distrust',()=>{
  for(const fork of ['kept','both_absent','no_promise'] as const){
    const result=runRelationshipFork(fork);
    assert.equal(result.afterOpportunity.baseline,'trusted');
    assert.equal(result.afterOpportunity.actual.trust,'trusted');
    assert.deepEqual(result.final.spokenTo,['friend']);
    assert.equal(result.final.incidents,0);
  }
  const absent=runRelationshipFork('both_absent');
  assert.equal(absent.firstResult.status,'expired');
  assert.equal(absent.firstResult.evidence.includes('waited_alone'),false);
});

test('#31.5: the system is opt-in; existing explicit relationship stays stable',()=>{
  const world=runRelationshipFork('broken',{optIn:false});
  assert.equal(world.firstResult.relationship.trust,'trusted');
  assert.equal(world.afterOpportunity.actual.trust,'trusted');
  assert.deepEqual(world.final.spokenTo,['friend']);
});

test('#31.5: a neutral baseline can be reduced, but not upgraded by mere attendance',()=>{
  const missed=runRelationshipFork('broken',{baseline:'neutral'});
  assert.equal(missed.afterOpportunity.actual.trust,'distrusted');
  const repaired=runRelationshipFork('repaired',{baseline:'neutral'});
  assert.equal(repaired.afterOpportunity.actual.trust,'neutral');
  const kept=runRelationshipFork('kept',{baseline:'neutral'});
  assert.equal(kept.afterOpportunity.actual.trust,'neutral');
});

test('#31.5: later evidence concerns only the same named partner',()=>{
  const waited={...pair,kind:'waited_alone' as const};
  const met={...pair,meetingId:2,minute:1180,kind:'met' as const};
  assert.equal(relationshipFromExperience('trusted',[waited],'11' as unknown as number).trust,'neutral');
  assert.equal(relationshipFromExperience('trusted',[waited,
    {...met,partner:12}],11).trust,'neutral');
  assert.equal(relationshipFromExperience('trusted',[waited,met],11).trust,'trusted');
  assert.equal(relationshipFromExperience('neutral',[met],11).trust,'neutral');
  assert.equal(relationshipFromExperience('distrusted',[met],11).trust,'distrusted');
  assert.equal(relationshipFromExperience('trusted',[met,waited],11).trust,'neutral');
});

test('#31.5: materialized checkpoint stores baseline, not the derived downgrade',()=>{
  const missed=runRelationshipFork('broken');
  assert.equal(missed.checkpoint.explicit,'trusted');
  assert.equal(missed.checkpoint.effective,'neutral');
  assert.equal(missed.checkpoint.projection.trust,'neutral');
  assert.deepEqual(missed.checkpoint.storedTrusts,missed.checkpoint.restoredTrusts);
  assert.equal(missed.checkpoint.storedTrusts.filter(
    ([,source,trust])=>source!==undefined&&trust==='trusted').length,1);
});

test('#31.5: counterfactuals are deterministic',()=>{
  for(const fork of ['broken','repaired','kept','both_absent','no_promise'] as const)
    assert.deepEqual(runRelationshipFork(fork),runRelationshipFork(fork));
});
