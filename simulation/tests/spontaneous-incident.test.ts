import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseMischiefTarget} from '../src/core/mischief.ts';
import {runSpontaneousFork} from '../src/scenarios/spontaneous-incident.ts';

const baseline={disposition:'reckless' as const,
  objectNearby:true,witnessPresent:true};

test('#31.2: NPC initiates physical incident by itself and consequences follow',()=>{
  const result=runSpontaneousFork(baseline);
  assert.equal(result.initial.worldEvents,0,'No setup-time incident');
  assert.equal(result.initial.objectBroken,false);
  assert.equal(result.initial.investigatorKnowsCulprit,false);
  assert.equal(result.outcome.autonomousBreaks,1);
  assert.equal(result.outcome.breakEvents,1);
  assert.equal(result.outcome.initiator,'prankster');
  assert.equal(result.decisions[0]?.actor,'prankster');
  assert.equal(result.decisions[0]?.action,'break_object');
  assert.equal(result.decisions[0]?.ok,true);
  assert.equal(result.outcome.heardCrash,true);
  assert.equal(result.outcome.sawBreak,false);
  assert.equal(result.outcome.reachedGallery,true);
  assert.equal(result.outcome.inspectedDamage,true);
  assert.equal(result.outcome.investigated,true);
  assert.ok(result.outcome.questionCount>0);
  assert.equal(result.outcome.witnessSaw,true);
  assert.equal(result.outcome.sourceAttribution,true);
  assert.equal(result.outcome.investigatorKnowsCulprit,true);
  const kinds=result.timeline.map(e=>e.kind);
  const sequence=['spontaneous_incident','damage_confirmed','question','testimony']
    .map(kind=>kinds.indexOf(kind));
  assert.ok(sequence.every(index=>index>=0));
  assert.ok(sequence.every((value,index)=>
    index===0||value>sequence[index-1]!));
});

test('#31.2: witnessed opportunity deters cautious NPC, not reckless NPC',()=>{
  const cautious=runSpontaneousFork({...baseline,disposition:'cautious'});
  assert.equal(cautious.outcome.broken,false);
  assert.equal(cautious.outcome.autonomousBreaks,0);
  assert.equal(cautious.outcome.investigated,false);
  assert.equal(cautious.outcome.investigatorKnowsCulprit,false);
});

test('#31.2: cautious NPC can act with the same object but nobody watching',()=>{
  const alone=runSpontaneousFork({...baseline,disposition:'cautious',witnessPresent:false});
  assert.equal(alone.outcome.broken,true);
  assert.equal(alone.outcome.autonomousBreaks,1);
  assert.equal(alone.outcome.heardCrash,true);
  assert.equal(alone.outcome.sourceAttribution,false);
});

test('#31.2: desire without a reachable object produces no incident',()=>{
  const absent=runSpontaneousFork({...baseline,objectNearby:false});
  assert.equal(absent.outcome.broken,false);
  assert.equal(absent.outcome.autonomousBreaks,0);
  assert.equal(absent.outcome.investigatorKnowsCulprit,false);
});

test('#31.2: neither neutral nor manually controlled actors are auto-puppeteered',()=>{
  const neutral=runSpontaneousFork({...baseline,disposition:null});
  const manual=runSpontaneousFork({...baseline,manual:true});
  assert.equal(neutral.outcome.autonomousBreaks,0);
  assert.equal(manual.outcome.autonomousBreaks,0);
});

test('#31.2: choice is local, deterministic and independent of enumeration order',()=>{
  assert.equal(chooseMischiefTarget({
    disposition:'reckless',intactObjects:[9,4,7],bystanders:[8]
  }),4);
  assert.equal(chooseMischiefTarget({
    disposition:'cautious',intactObjects:[9,4,7],bystanders:[8]
  }),null);
  assert.equal(chooseMischiefTarget({
    disposition:'cautious',intactObjects:[9,4,7],bystanders:[]
  }),4);
  assert.equal(chooseMischiefTarget({
    disposition:'reckless',intactObjects:[],bystanders:[]
  }),null);
  assert.deepEqual(runSpontaneousFork(baseline),runSpontaneousFork(baseline));
});
