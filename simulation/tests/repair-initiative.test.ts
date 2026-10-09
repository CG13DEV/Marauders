import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/Simulation.ts';
import {runOpenSocialWorld} from '../src/scenarios/open-social-life.ts';
import {ownUnrepairedCommitment,considersConcreteRepair}
  from '../src/core/reconciliation.ts';
import type {CommitmentMemory} from '../src/core/social-commitments.ts';

test('31.8: only an actual first-person self-missed commitment motivates amends',()=>{
  const make=(kind:CommitmentMemory['kind'],minute:number,
    repairOfMeetingId?:number):CommitmentMemory=>({
    meetingId:minute,partner:9,kind,minute,room:1,purpose:'explore',
    ...(repairOfMeetingId===undefined?{}:{repairOfMeetingId})
  });
  const missed=make('missed_my_promise',2600);
  assert.equal(ownUnrepairedCommitment([make('promised',1100)],4100),null);
  assert.equal(ownUnrepairedCommitment([missed],4100)?.partner,9);
  assert.equal(ownUnrepairedCommitment([missed,make('offered',4100,2600)],4100),null);
  assert.equal(ownUnrepairedCommitment([missed,make('met',4100)],4120),null);
  assert.equal(ownUnrepairedCommitment([missed],2600+7*1440+1),null);
  assert.equal(considersConcreteRepair({
    personalHistory:[make('waited_alone',2600)],
    partner:9,repairOfMeetingId:2600,response:'open'
  }),true);
  assert.equal(considersConcreteRepair({
    personalHistory:[make('waited_alone',2600)],
    partner:9,repairOfMeetingId:2600,response:'guarded'
  }),false);
  assert.equal(considersConcreteRepair({
    personalHistory:[make('waited_alone',2600)],
    partner:8,repairOfMeetingId:2600,response:'open'
  }),false);
});

test('31.8: nobody can fabricate an apology without personally missing a promise',()=>{
  const world=createSimulation();
  const room=world.room('common','Common room');
  const one=world.character('one','One',room);
  const two=world.character('two','Two',room);
  const offer=world.execute({type:'offer_meeting',actor:one,listener:two,
    room,atMinute:1180,purpose:'explore',repairOfMeetingId:1});
  assert.equal(offer.ok,false);
  if(!offer.ok) assert.equal(offer.reason,'no_personal_lapse_to_repair');
  assert.equal(world.meetingLedger().length,0);
  assert.equal(world.promiseHistory(two).length,0);
});

test('31.8: missed own promise yields autonomous specific proposal and consent',()=>{
  const x=runOpenSocialWorld('repair_open',4);
  const expiry=x.conflictSnapshots.find(s=>s.minute===2640)!;
  const beforeNewMeeting=x.conflictSnapshots.find(s=>s.minute===4070)!;
  const after=x.conflictSnapshots.find(s=>s.minute===5520)!;
  assert.equal(expiry.firstMeetingStatus,'expired');
  assert.equal(expiry.selfMissedMyPromise,true);
  assert.equal(expiry.jamesOutcome,null);
  assert.equal(expiry.siriusOutcome,'waited_alone');
  assert.equal(beforeNewMeeting.siriusTrust,'neutral',
    'Making an offer or chatting is NOT forgiveness');
  assert.equal(after.repairStatus,'kept');
  assert.equal(after.siriusTrust,'trusted');
  assert.equal(after.siriusOutcome,'met');
  assert.equal(x.summary.repairOffers,1);
  assert.equal(x.summary.repairKept,1);
  assert.equal(x.summary.repairDeclined,0);
  const initiative=x.trace.filter(t=>t.action==='offer_meeting'&&
    t.repairOfMeetingId!==undefined);
  assert.equal(initiative.length,1,'No apology spam');
  assert.equal(initiative[0]?.actor,'James');
  assert.equal(initiative[0]?.target,'Sirius');
  assert.equal(initiative[0]?.repairOfMeetingId,1);
  assert.equal(x.checkpoint.sameRuntime,true);
  assert.equal(x.checkpoint.sameRelationships,true);
});

test('31.8: the same attempted amends can be independently refused',()=>{
  const open=runOpenSocialWorld('repair_open',4);
  const guarded=runOpenSocialWorld('repair_guarded',4);
  assert.equal(guarded.summary.repairOffers,1);
  assert.equal(guarded.summary.repairDeclined,1);
  assert.equal(guarded.summary.repairKept,0);
  assert.equal(guarded.conflictSnapshots.find(s=>s.minute===5520)?.siriusTrust,'neutral');
  assert.equal(open.conflictSnapshots.find(s=>s.minute===5520)?.siriusTrust,'trusted');
  assert.equal(guarded.trace.filter(x=>x.repairOfMeetingId!==undefined).length,1);
  assert.equal(guarded.checkpoint.sameRuntime,true);
});

test('31.8: no failure and opt-out worlds do not invent apologies',()=>{
  const healthy=runOpenSocialWorld('repair_unneeded',4);
  const disabled=runOpenSocialWorld('lesson_first',4);
  assert.equal(healthy.summary.repairOffers,0);
  assert.equal(disabled.summary.repairOffers,0);
  assert.equal(healthy.summary.expired,0);
  assert.equal(disabled.summary.expired>=1,true);
});

test('31.8: personal histories, choices and checkpoint outcomes are deterministic',()=>{
  for(const variant of ['repair_open','repair_guarded'] as const)
    assert.deepEqual(runOpenSocialWorld(variant,4),runOpenSocialWorld(variant,4));
});
