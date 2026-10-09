/** R4 [GAME]: measured (not asserted) materialized runtime snapshot profile.
 * 634 residents, sparse trust; O(N²) ECS pair scan is deliberately retained
 * until profiling supports an optimization and compatibility plan.
 */
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createSimulation} from '../core/Simulation.ts';

const samples=[] as Array<{
  characters:number;directedPairChecks:number;
  snapshotBytes:number;p95Milliseconds:number;meanMilliseconds:number;
  residentTrustEntries:number;eventCount:number;
}>;
for(const count of [48,144,634]){
  const world=createSimulation();
  const room=world.room('common','Общая комната');
  let first:number|undefined;
  let second:number|undefined;
  for(let i=0;i<count;i++){
    const id=world.character('student-'+i,'Студент '+i,room);
    if(i===0)first=id;
    if(i===1)second=id;
  }
  world.setTrust(first!,second!,'trusted');
  const durations:number[]=[];
  let runtime=world.captureRuntime();
  for(let run=0;run<4;run++){
    const start=performance.now();
    runtime=world.captureRuntime();
    durations.push(performance.now()-start);
  }
  const sorted=[...durations].sort((a,b)=>a-b);
  const entry={
    characters:count,
    directedPairChecks:count*(count-1),
    snapshotBytes:Buffer.byteLength(JSON.stringify(runtime)),
    p95Milliseconds:sorted[Math.ceil(sorted.length*0.95)-1]!,
    meanMilliseconds:durations.reduce((a,b)=>a+b,0)/durations.length,
    residentTrustEntries:runtime.trusts.length,
    eventCount:runtime.events.length
  };
  assert.equal(entry.residentTrustEntries,1);
  assert.equal(entry.eventCount,0);
  assert.equal(runtime.flags.length,count);
  assert.ok(entry.snapshotBytes>0&&Number.isFinite(entry.p95Milliseconds));
  samples.push(entry);
}
console.log(JSON.stringify({
  experiment:'R4',classification:'[GAME]',
  method:'Four runtime snapshot captures per school size; no pass/fail speed bound',
  disclaimer:'Measurements are hardware-dependent and do not include disk/database persistence or serialization setup operations',
  samples
},null,2));
