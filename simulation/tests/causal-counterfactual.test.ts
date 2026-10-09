import test from 'node:test';
import assert from 'node:assert/strict';
import {runCausalFork} from '../src/scenarios/causal-counterfactual.ts';

test('#31.1: one local incident produces autonomous investigation and witness-derived knowledge',()=>{
  const incident=runCausalFork({damage:true,witnessCanSee:true});
  assert.equal(incident.initial.witnessedByWitness,true);
  assert.equal(incident.initial.investigatorHeardCrash,true);
  assert.equal(incident.initial.investigatorKnowsCulprit,false,
    'Adjacent noise must not reveal the culprit');
  assert.equal(incident.outcome.personallySawIncident,false);
  assert.equal(incident.outcome.physicallyReachedGallery,true);
  assert.ok(incident.outcome.successfulVisits>0,
    'Investigator must physically traverse into the room');
  assert.equal(incident.outcome.inspectedDamage,true);
  assert.equal(incident.outcome.investigated,true);
  assert.ok(incident.outcome.questionCount>0,
    'NPC must ask a real local question, without script-forced interrogation');
  assert.ok(incident.outcome.answeredQuestions>0);
  assert.ok(incident.outcome.testimonyCount>0);
  assert.ok(incident.outcome.attribution.some(a=>
    a.culprit==='culprit'&&a.evidence==='testimony'&&a.speaker==='witness'),
    'A causal claim must be acquired from the eyewitness, not omniscient truth');
  assert.equal(incident.outcome.inquiryStatuses.includes('completed'),true);
  const kinds=incident.timeline.map(x=>x.kind);
  const positions=['incident','investigator_moved','found_damage',
    'goal_queued','question_answered','testimony'].map(k=>kinds.indexOf(k));
  assert.ok(positions.every(x=>x>=0),'Every link must appear in the trace');
  assert.ok(positions.every((x,i)=>i===0||x>positions[i-1]!),
    'Causal links must appear in chronological order');
});

test('#31.1: without incident the same NPC routine makes no accusation',()=>{
  const control=runCausalFork({damage:false,witnessCanSee:true});
  assert.equal(control.initial.investigatorHeardCrash,false);
  assert.equal(control.outcome.physicallyReachedGallery,true);
  assert.equal(control.outcome.inspectedIntact,true);
  assert.equal(control.outcome.inspectedDamage,false);
  assert.equal(control.outcome.investigated,false);
  assert.equal(control.outcome.questionCount,0);
  assert.equal(control.outcome.knownCulprit,false);
  assert.deepEqual(control.outcome.attribution,[]);
});

test('#31.1: removing a witness perception prevents attribution without fabricating evidence',()=>{
  const blind=runCausalFork({damage:true,witnessCanSee:false});
  assert.equal(blind.initial.investigatorHeardCrash,true);
  assert.equal(blind.initial.witnessedByWitness,false);
  assert.equal(blind.outcome.physicallyReachedGallery,true);
  assert.equal(blind.outcome.inspectedDamage,true);
  assert.equal(blind.outcome.investigated,true);
  assert.ok(blind.outcome.questionCount>0,
    'Investigator still asks locally, even without a usable witness');
  assert.equal(blind.outcome.answeredQuestions,0,
    'No answer can be supplied without a personal belief; culprit is guarded');
  assert.equal(blind.outcome.testimonyCount,0);
  assert.equal(blind.outcome.knownCulprit,false);
  assert.deepEqual(blind.outcome.attribution,[]);
});

test('#31.1: the causal experiment is deterministic under fixed initial facts',()=>{
  const input={damage:true,witnessCanSee:true};
  assert.deepEqual(runCausalFork(input),runCausalFork(input));
});
