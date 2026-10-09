/**
 * #30.8 [GAME] Week-long 634-resident soak and persistence diagnostic.
 *
 * This does not inject scripts or alter NPC policy. Per-day CPU and memory
 * samples are observational; do not interpret raw heap growth as a leak:
 * memories and the authoritative event ledger intentionally accumulate.
 */
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createPersistentSimulation,restoreCheckpoint} from '../core/persistence.ts';
import {createSchoolWeek,reportSchoolWeek} from '../scenarios/school-week.ts';

const DAYS=7, TICKS_PER_DAY=144, TICKS=DAYS*TICKS_PER_DAY;
const MIB=1024*1024;
const start=performance.now();
const world=createPersistentSimulation();
const scene=createSchoolWeek(world,'adaptive','autonomous',
  '96-all','expanded','research-600','foundations-27','unified-30');
const setupMs=Math.round(performance.now()-start);
const residents=scene.residents?.people??[];
const actorIds=[...scene.students.map(p=>p.id),
  ...scene.professors.map(p=>p.id),...residents.map(p=>p.id)];
assert.equal(new Set(actorIds).size,634,'World must contain 634 unique actors');
assert.ok(actorIds.every(id=>world.usesUnifiedTravel(id)),
  'All residents must use actor-local navigation');

const filch=residents.find(p=>p.key==='caretaker_filch')?.id;
const norris=residents.find(p=>p.key==='mrs_norris')?.id;
let moves=0,patrolMoves=0,failedTravel=0,actions=0,doors=0;
const daily=[];
let simulatedMs=0;
for(let day=1;day<=DAYS;day++){
  let dayMs=0,dayMoves=0,dayActions=0,dayFailures=0;
  for(let tick=0;tick<TICKS_PER_DAY;tick++){
    const begin=performance.now();
    const decisions=world.step();
    dayMs+=performance.now()-begin;
    dayActions+=decisions.length;
    for(const {actor,action,result} of decisions){
      if(action.type!=='move'&&action.type!=='open_door')continue;
      if(!result.ok){dayFailures++;continue;}
      if(action.type==='move'){
        moves++;dayMoves++;
      } else doors++;
      if(actor===filch||actor===norris)patrolMoves++;
    }
  }
  simulatedMs+=dayMs;
  actions+=dayActions;
  failedTravel+=dayFailures;
  const usage=process.memoryUsage();
  // Diagnostics are taken OUTSIDE the simulation tick time; this copies the
  // immutable event journal only once a day, not once for every character/tick.
  const eventCount=world.events().length;
  const attendance=scene.students.reduce((counts,student)=>{
    for(const record of world.attendance(student.id))counts[record.status]++;
    return counts;
  },{on_time:0,late:0,missed:0,pending:0});
  const meals=scene.students.reduce((n,student)=>
    n+world.mealHistory(student.id).length,0);
  const conversations=scene.students.reduce((n,student)=>
    n+world.conversationHistory(student.id).length,0);
  const rests=scene.students.reduce((n,student)=>
    n+world.restHistory(student.id).length,0);
  daily.push({
    day,ticks:day*TICKS_PER_DAY,stepMs:Math.round(dayMs),
    moves:dayMoves,decisions:dayActions,failedTravel:dayFailures,
    events:eventCount,meals,conversations,rests,attendance,
    heapUsedMiB:Math.round(usage.heapUsed/MIB),
    heapTotalMiB:Math.round(usage.heapTotal/MIB),
    rssMiB:Math.round(usage.rss/MIB)
  });
  assert.equal(world.tick(),day*TICKS_PER_DAY,'Tick clock must advance');
  assert.equal(dayFailures,0,'Every actor must traverse validated routes');
}

const report=reportSchoolWeek(scene);
assert.equal(world.tick(),TICKS,'The full seven days must be simulated');
assert.ok(moves>0&&patrolMoves>0,'Residents and patrol must move');
assert.equal(report.attendance.pending,0,
  'All scheduled lessons must be resolved at the end of the week');

// Checkpoint restoration occurs AFTER measuring the seven-day memory/CPU
// samples. Comparison then continues into day 8, exercising the live policy
// rather than merely verifying the serialized bytes.
const checkpointStart=performance.now();
const checkpoint=JSON.stringify(world.checkpoint());
const checkpointBytes=Buffer.byteLength(checkpoint);
const checkpointMs=Math.round(performance.now()-checkpointStart);
const restoreStart=performance.now();
const restored=restoreCheckpoint(checkpoint);
const restoreMs=Math.round(performance.now()-restoreStart);
const REPLAY_TICKS=12;
for(let step=0;step<REPLAY_TICKS;step++){
  assert.deepEqual(restored.step(),world.step(),
    'Post-restore world actions diverged at step '+step);
}
assert.deepEqual(restored.captureRuntime(),world.captureRuntime(),
  'Restored world diverged in positions, knowledge or memories');
assert.equal(restored.tick(),TICKS+REPLAY_TICKS);

console.log(JSON.stringify({
  experiment:'30.8',scenario:'[GAME] seven-day 634-resident unified-school soak',
  residents:actorIds.length,pupils:scene.students.length,
  professors:scene.professors.length,otherResidents:residents.length,
  ticks:TICKS,minutesPerTick:10,setupMs,simulatedMs:Math.round(simulatedMs),
  actions:{decisions:actions,moves,patrolMoves,doors,failedTravel},
  final:{attendance:report.attendance,pupilMeals:report.pupilMeals,
    pupilConversations:report.pupilConversations,
    firstPupilSecretPassages:world.passageDiscoveries(scene.students[0]!.id).length,
    filchSecretPassages:filch===undefined?null:world.passageDiscoveries(filch).length},
  daily,
  checkpoint:{format:'V2',atTick:TICKS,bytes:checkpointBytes,
    checkpointMs,restoreMs,replayTicks:REPLAY_TICKS,identical:true},
  memoryNote:'Heap snapshots are not forced-GC measurements; persistent event and memory histories legitimately accumulate'
},null,2));
