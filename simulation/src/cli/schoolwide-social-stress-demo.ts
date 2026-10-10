/**
 * [GAME] #32.0 experimental scale gate for the completed 31.x policies.
 * Rebuilds the existing 634-resident school; changes ONLY opt-in NPC policy
 * at setup. The resulting week's movements, contacts and obligations are
 * entirely driven by world.step(), not scripted scenario interventions.
 *
 * Use --baseline and --all-eligible as SEPARATE Node processes for more
 * honest heap/CPU comparisons. On GitHub runners timing is observational,
 * not a device-independent performance benchmark.
 */
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createPersistentSimulation,restoreCheckpoint} from '../core/persistence.ts';
import {createSchoolWeek,reportSchoolWeek} from '../scenarios/school-week.ts';
import {installSchoolwideSocialPolicy,
  type SchoolSocialMode} from '../scenarios/schoolwide-social.ts';

const mode:SchoolSocialMode=process.argv.includes('--all-eligible')
  ?'all-eligible':'baseline';
const DAYS=7,TICKS=144*DAYS,MIB=1024*1024;
const start=performance.now();
const world=createPersistentSimulation();
const scene=createSchoolWeek(world,'adaptive','autonomous',
  '96-all','expanded','research-600','foundations-27','unified-30');
const rollout=installSchoolwideSocialPolicy(scene,mode);
const setupMs=performance.now()-start;
assert.equal(rollout.roster,634);
assert.equal(rollout.students,600);
assert.equal(rollout.professors,25);
assert.equal(rollout.otherResidents,9);
assert.equal(rollout.eligible,624,
  '600 pupils and 24 active staff are eligible; Binns and the other 9 special residents are excluded');
assert.equal(rollout.roster-rollout.eligible,rollout.excluded.length);
if(mode==='all-eligible'){
  assert.equal(rollout.enabled,624);
  assert.equal(rollout.pupilPolicies,600);
  assert.equal(rollout.facultyPolicies,24);
}

const costs:number[]=[],daily=[];
let totalDecisions=0,failedTravel=0,offers=0,answers=0,meetings=0,chat=0;
for(let day=1;day<=DAYS;day++){
  let dayCpu=0,dayDecisions=0,dayOffers=0,dayChats=0;
  for(let t=0;t<144;t++){
    const begin=performance.now();
    const decisions=world.step();
    const took=performance.now()-begin;
    costs.push(took);dayCpu+=took;
    totalDecisions+=decisions.length;dayDecisions+=decisions.length;
    for(const d of decisions){
      if((d.action.type==='move'||d.action.type==='open_door')&&!d.result.ok)
        failedTravel++;
      if(!d.result.ok)continue;
      if(d.action.type==='offer_meeting'){offers++;dayOffers++;}
      if(d.action.type==='answer_meeting')answers++;
      if(d.action.type==='promise_meeting')meetings++;
      if(d.action.type==='chat'){chat++;dayChats++;}
    }
  }
  // GC-sampled memory is not a proxy for ECS bytes or retained events.
  if(global.gc)global.gc();
  const heap=process.memoryUsage();
  daily.push({
    day,steps:144,stepMs:Math.round(dayCpu),
    decisions:dayDecisions,spontaneousOffers:dayOffers,chats:dayChats,
    heapAfterGcMiB:Math.round(heap.heapUsed/MIB),
    rssMiB:Math.round(heap.rss/MIB)
  });
  assert.equal(world.tick(),day*144);
}
assert.equal(failedTravel,0,'No new invalid navigation caused by social policy');
assert.ok(chat>0,'Social policies must run in a living, talking school');

const school=reportSchoolWeek(scene);
assert.equal(school.attendance.pending,0);
assert.equal(school.attendance.missed,0);
assert.ok(school.pupilMeals>0&&school.pupilRests>0);
assert.ok(school.pupilConversations>0);
assert.ok(school.invitations>0,'Social invites must actually occur');
assert.ok(school.acceptedInvitations+school.declinedInvitations>0,
  'NPCs must actually exercise autonomous consent');
const ledger=world.meetingLedger();
const repairs=ledger.filter(m=>m.repairOfMeetingId!==undefined);
const saved=world.checkpoint();
const checkpointBytes=Buffer.byteLength(JSON.stringify(saved));
const restored=restoreCheckpoint(saved);
assert.deepEqual(restored.captureRuntime(),world.captureRuntime());
for(let i=0;i<12;i++){
  assert.deepEqual(restored.step(),world.step(),
    'Social decisions diverged after checkpoint at replay step '+i);
}
assert.deepEqual(restored.captureRuntime(),world.captureRuntime());
const sorted=[...costs].sort((a,b)=>a-b);
const percentile=(q:number)=>Math.round(
  sorted[Math.max(0,Math.ceil(q*sorted.length)-1)]!*100)/100;
const memory=process.memoryUsage();
const result={
  experiment:'32.0',classification:'[GAME]',mode,
  setupMs:Math.round(setupMs),rollout,
  ticks:TICKS,days:DAYS,stepCpuMs:Math.round(costs.reduce((a,b)=>a+b,0)),
  perTickMs:{p50:percentile(.50),p95:percentile(.95),
    p99:percentile(.99),max:percentile(1)},
  decisions:totalDecisions,
  failedTravel,
  social:{
    successfulOffers:offers,autonomousAnswers:answers,
    autonomouslyPromised:meetings,conversations:chat,
    pending:ledger.filter(m=>m.status==='pending').length,
    offered:ledger.filter(m=>m.status==='offered').length,
    accepted:school.acceptedInvitations,declined:school.declinedInvitations,
    kept:school.fulfilledMeetings,expired:school.missedMeetings,
    repairsOffered:repairs.length,
    repairsKept:repairs.filter(m=>m.status==='kept').length
  },
  attendance:school.attendance,
  pupilMeals:school.pupilMeals,pupilConversations:school.pupilConversations,
  finalAfterGcHeapMiB:Math.round(memory.heapUsed/MIB),
  finalRssMiB:Math.round(memory.rss/MIB),
  checkpoint:{bytes:checkpointBytes,format:'V2',replayTicks:12,identical:true},
  daily,
  caveats:[
    'Not every 634 resident qualifies for human social policy: 624 do; special roles keep their physics.',
    'One academic week is an empirical capacity probe, not an asymptotic or multi-year guarantee.',
    'Memory and timing are measured on one GitHub runner; CPU/memory comparisons are indicative, not hard universal limits.',
    'The audit tests naturally emergent relationships; zero spontaneous repair events would mean the rare repair path is not yet exercised at this scale.'
  ]
};
console.log(JSON.stringify(result,null,2));
