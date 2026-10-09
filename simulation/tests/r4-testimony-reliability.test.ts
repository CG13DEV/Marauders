import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/Simulation.ts';
import {createPersistentSimulation,restoreCheckpoint} from '../src/core/persistence.ts';

function testimonyFork(missed:boolean){
  const world=createSimulation();
  const hall=world.room('hall','Зал');
  const corridor=world.room('corridor','Коридор');
  world.connect(hall,corridor);
  const observer=world.character('observer','Наблюдатель',hall);
  const speaker=world.character('speaker','Друг',hall);
  const alleged=world.character('alleged','Обвиняемый',hall);
  const object=world.fragileObject('object','Ваза',hall);
  world.setDailyLife(observer,{homeRoom:hall,diningRoom:hall,
    style:'reserved',interest:'castle',relationshipLearning:true});
  world.setTrust(observer,speaker,'trusted');
  world.setManualControl(observer,true);
  world.setManualControl(speaker,true);
  const pledge=world.execute({type:'promise_meeting',actor:speaker,
    listener:observer,room:hall,atMinute:540,purpose:'explore'});
  assert.equal(pledge.ok,true);
  if(missed)assert.equal(world.execute({
    type:'move',actor:speaker,destination:corridor}).ok,true);
  for(let i=0;i<8;i++)world.step();
  if(missed)assert.equal(world.execute({
    type:'move',actor:speaker,destination:hall}).ok,true);
  const report=world.execute({type:'tell',actor:speaker,listener:observer,
    claim:{kind:'broke_object',culprit:alleged,object}});
  assert.equal(report.ok,true);
  return {
    relation:world.trustOf(observer,speaker),
    explicit:world.explicitTrustOf(observer,speaker),
    assessment:world.assessment(observer,object),
    factual:world.isBroken(object)
  };
}
test('R4: personal grievance alters affiliation but not testimony reliability',()=>{
  const missed=testimonyFork(true);
  const kept=testimonyFork(false);
  assert.equal(missed.relation,'neutral');
  assert.equal(kept.relation,'trusted');
  assert.equal(missed.explicit,'trusted');
  assert.deepEqual(missed.assessment,kept.assessment);
  assert.equal(missed.assessment.status,'reported');
  if(missed.assessment.status==='reported')
    assert.equal(missed.assessment.reports[0]?.speakers[0]?.trust,'trusted');
  assert.equal(missed.factual,false);
  assert.equal(kept.factual,false);
});
test('R4: materialized checkpoint stores sparse baseline and preserves it on restore',()=>{
  const world=createPersistentSimulation();
  const hall=world.room('hall','Зал');
  const a=world.character('a','А',hall);
  const b=world.character('b','Б',hall);
  world.setTrust(a,b,'trusted');
  const first=world.captureRuntime();
  const restored=restoreCheckpoint(world.checkpoint());
  const second=restored.captureRuntime();
  assert.deepEqual(first.trusts,second.trusts);
  assert.equal(second.trusts.length,1);
  assert.equal(restored.explicitTrustOf(a,b),'trusted');
});
