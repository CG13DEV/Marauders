import test from 'node:test';
import assert from 'node:assert/strict';
import {livedMischiefMotive,chooseMischiefTarget} from '../src/core/mischief.ts';
import {runLivedMotivationFork} from '../src/scenarios/lived-motivation.ts';
import type {CommitmentMemory} from '../src/core/social-commitments.ts';

const memory=(kind:CommitmentMemory['kind'],minute=560):CommitmentMemory=>({
  kind,minute,meetingId:1,partner:7,room:2,purpose:'explore'
});

test('#31.3: an attended but broken promise changes the next physical decision',()=>{
  const a=runLivedMotivationFork('waited_alone');
  assert.equal(a.initial.broken,false);
  assert.equal(a.initial.motive,null);
  assert.equal(a.atResolution.meetingStatus,'expired');
  assert.ok(a.atResolution.memory.includes('waited_alone'));
  assert.equal(a.atResolution.personalMotive?.kind,'unreconciled_absence');
  assert.deepEqual(a.opportunity,{
    pupilInGallery:true,friendElsewhere:true,intact:true,time:560
  });
  assert.equal(a.outcome.spontaneousBreaks,1);
  assert.equal(a.outcome.breakEvents,1);
  assert.equal(a.outcome.broken,true);
  assert.equal(a.outcome.friendObservedBreaking,false);
  assert.equal(a.decisions.filter(x=>x.action==='break_object').length,1);
  assert.equal(a.decisions.find(x=>x.action==='break_object')?.tick,9);
});

test('#31.3: same personality and opportunity after a kept promise gives no incident',()=>{
  const x=runLivedMotivationFork('kept');
  assert.equal(x.atResolution.meetingStatus,'kept');
  assert.ok(x.atResolution.memory.includes('met'));
  assert.equal(x.atResolution.personalMotive,null);
  assert.equal(x.outcome.spontaneousBreaks,0);
  assert.equal(x.outcome.broken,false);
});

test('#31.3: not waiting at the appointment does not fabricate firsthand grievance',()=>{
  const x=runLivedMotivationFork('both_absent');
  assert.equal(x.atResolution.meetingStatus,'expired');
  assert.ok(!x.atResolution.memory.includes('waited_alone'));
  assert.equal(x.atResolution.personalMotive,null);
  assert.equal(x.outcome.spontaneousBreaks,0);
  assert.equal(x.outcome.broken,false);
});

test('#31.3: no promise, same solitude and vase, produces no action',()=>{
  const x=runLivedMotivationFork('no_promise');
  assert.equal(x.atResolution.meetingStatus,null);
  assert.equal(x.outcome.spontaneousBreaks,0);
  assert.equal(x.outcome.broken,false);
});

test('#31.3: motives are recent, subjective, and can be reconciled',()=>{
  assert.equal(livedMischiefMotive([],570),null);
  assert.equal(livedMischiefMotive([memory('heard_promise')],570),null);
  assert.deepEqual(livedMischiefMotive([memory('waited_alone')],570),{
    kind:'unreconciled_absence',partner:7,meetingId:1
  });
  assert.equal(livedMischiefMotive([memory('waited_alone')],741),null);
  assert.equal(livedMischiefMotive([memory('waited_alone')],559),null);
  assert.equal(livedMischiefMotive([
    memory('waited_alone'),memory('met',570)
  ],580),null);
  assert.equal(chooseMischiefTarget({
    disposition:'reactive',intactObjects:[5],bystanders:[]
  }),null);
  assert.equal(chooseMischiefTarget({
    disposition:'reactive',intactObjects:[5],bystanders:[8],
    motive:{kind:'unreconciled_absence',partner:7,meetingId:1}
  }),null);
  assert.equal(chooseMischiefTarget({
    disposition:'reactive',intactObjects:[5],bystanders:[],
    motive:{kind:'unreconciled_absence',partner:7,meetingId:1}
  }),5);
});

test('#31.3: all forks repeat deterministically',()=>{
  for(const fork of ['kept','waited_alone','both_absent','no_promise'] as const)
    assert.deepEqual(runLivedMotivationFork(fork),runLivedMotivationFork(fork));
});
