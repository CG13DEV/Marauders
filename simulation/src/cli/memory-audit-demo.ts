/**
 * [GAME] #30.9: observational GC, runtime state and ECS-component census.
 *
 * Run with --expose-gc. No event pruning or changes to personal knowledge.
 * A 14-day run exercises persistent history beyond the scheduled school week;
 * the school timetable is NOT populated with a second week's lessons.
 */
import assert from 'node:assert/strict';
import {performance,PerformanceObserver} from 'node:perf_hooks';
import {createPersistentSimulation} from '../core/persistence.ts';
import {createSchoolWeek,reportSchoolWeek} from '../scenarios/school-week.ts';

const gc=global.gc;
if(typeof gc!=='function')
  throw Error('Experiment 30.9 requires node --expose-gc');
const MiB=1024*1024;
const DAYS=14, TICKS_PER_DAY=144;
let gcEvents=0,gcDurationMs=0;
const observer=new PerformanceObserver(list=>{
  for(const event of list.getEntries()){
    gcEvents++;
    gcDurationMs+=event.duration;
  }
});
observer.observe({entryTypes:['gc']});
const flushGc=()=>new Promise<void>(resolve=>setImmediate(resolve));
const memory=()=>{
  const m=process.memoryUsage();
  return {heapUsedMiB:+(m.heapUsed/MiB).toFixed(1),
    heapTotalMiB:+(m.heapTotal/MiB).toFixed(1),
    rssMiB:+(m.rss/MiB).toFixed(1),
    externalMiB:+(m.external/MiB).toFixed(1),
    arrayBuffersMiB:+(m.arrayBuffers/MiB).toFixed(1)};
};
const setupBegin=performance.now();
const world=createPersistentSimulation();
const school=createSchoolWeek(world,'adaptive','autonomous',
  '96-all','expanded','research-600','foundations-27','unified-30');
const setupMs=+(performance.now()-setupBegin).toFixed(1);
assert.equal(school.students.length+school.professors.length+
  (school.residents?.people.length??0),634);

type SectionProfile={sectionsBytes:Record<string,number>;
  componentCounts:Record<string,number>;entities:number;events:number;
  eventKinds:Record<string,number>;personalHistoryEntries:Record<string,number>};
function profileRuntime():SectionProfile{
  // The public materialized snapshot exposes all authoritatively saved state.
  // Serialized sizes are not precise in-memory ECS allocation measurements.
  const s=world.captureRuntime();
  const sectionsBytes:Record<string,number>={};
  for(const [section,value] of Object.entries(s))
    sectionsBytes[section]=Buffer.byteLength(JSON.stringify(value));
  const componentCounts:Record<string,number>={};
  for(const [,flags] of s.flags)
    for(const [name,present] of Object.entries(flags))
      if(present)componentCounts[name]=(componentCounts[name]??0)+1;
  const eventKinds:Record<string,number>={};
  for(const event of s.events)
    eventKinds[event.type]=(eventKinds[event.type]??0)+1;
  const personalHistoryEntries:Record<string,number>={};
  for(const section of ['observations','beliefs','learning','meals',
      'conversations','rests','intentions','commitmentMemories',
      'pointNews','assistance'] as const){
    // Snapshot sections have heterogeneous item types; only their lengths
    // matter for the census, never the content of someone's private memory.
    const pairs:unknown=(s as unknown as Record<string,unknown>)[section];
    let count=0;
    if(Array.isArray(pairs))
      for(const entry of pairs)
        if(Array.isArray(entry)&&Array.isArray(entry[1]))
          count+=entry[1].length;
    personalHistoryEntries[section]=count;
  }
  return {sectionsBytes,componentCounts,entities:s.entityKeys.length,
    events:s.events.length,eventKinds,personalHistoryEntries};
}
gc();
await flushGc();
const initial=memory();
const days=[];
const snapshots:Record<string,SectionProfile>={};
let totalDecisions=0,failedTravel=0,totalMoves=0;
for(let day=1;day<=DAYS;day++){
  const begin=performance.now();
  let dayDecisions=0,dayMoves=0;
  for(let t=0;t<TICKS_PER_DAY;t++){
    for(const decision of world.step()){
      dayDecisions++;
      if(decision.action.type==='move' && decision.result.ok){
        totalMoves++;dayMoves++;
      }
      if((decision.action.type==='move'||decision.action.type==='open_door')
        && !decision.result.ok) failedTravel++;
    }
  }
  const stepMs=+(performance.now()-begin).toFixed(1);
  totalDecisions+=dayDecisions;
  await flushGc();
  const autoGcCount=gcEvents,autoGcMs=gcDurationMs;
  // Retained heap requires a forced collection; this is OFF the tick timer
  // and intentionally alters GC cadence versus the uninstrumented baseline.
  const beforeGc=memory();
  const forcedBegin=performance.now();
  gc();
  await flushGc();
  const forcedMs=+(performance.now()-forcedBegin).toFixed(1);
  const afterGc=memory();
  let storedEvents:number;
  if(day===1||day===7||day===14){
    const snapshot=profileRuntime();
    snapshots['day'+day]=snapshot;
    storedEvents=snapshot.events;
  }else{
    storedEvents=world.events().length;
  }
  days.push({day,stepMs,decisions:dayDecisions,moves:dayMoves,
    events:storedEvents,beforeGc,afterGc,forcedMs,
    // Observer events include forced collections from prior days. We report
    // cumulative values to avoid incorrectly classifying by trigger.
    observedGcEvents:autoGcCount,
    observedGcDurationMs:+autoGcMs.toFixed(1)});
  assert.equal(world.tick(),day*TICKS_PER_DAY);
  assert.equal(failedTravel,0,'No invalid physical travel allowed');
}
assert.equal(world.tick(),DAYS*TICKS_PER_DAY);
assert.ok(totalMoves>0 && totalDecisions>0);
const report=reportSchoolWeek(school);
assert.equal(report.attendance.pending,0);

const checkpointBegin=performance.now();
const checkpoint=world.checkpoint();
const checkpointMs=+(performance.now()-checkpointBegin).toFixed(1);
const serializationBegin=performance.now();
const checkpointBytes=Buffer.byteLength(JSON.stringify(checkpoint));
const serializationMs=+(performance.now()-serializationBegin).toFixed(1);
observer.disconnect();
console.log(JSON.stringify({
  experiment:'30.9',scenario:'[GAME] 14-day GC, ECS and history retention audit',
  actors:634,days:DAYS,ticks:world.tick(),setupMs,initial,
  totalDecisions,totalMoves,failedTravel,
  scheduleNote:'School lessons were scheduled for the first week only; second week tests autonomous history retention, not a new class timetable.',
  daysSummary:days,
  stateSamples:snapshots,
  checkpoint:{bytes:checkpointBytes,checkpointMs,serializationMs,
    containsFullEventHistory:true},
  finalAttendance:report.attendance,
  measurementNote:'Forced GC is outside measured world steps; serialized section sizes are not direct ECS heap measurements. No events or personal memories are deleted.'
},null,2));
