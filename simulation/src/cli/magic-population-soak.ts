/** [GAME] Opt-in performance gate: a REAL 600-pupil week with living magic.
 * Compares the same public timetable/population in legacy and scientific modes.
 * No claim that all pupils learn the one workshop. */
import {performance} from 'node:perf_hooks';
import {createSchoolWeek} from '../scenarios/school-week.ts';

type AcademicMode='legacy'|'living-g4-5';
const ticks=560;
function measure(mode:AcademicMode){
  const started=performance.now();
  const scene=createSchoolWeek(undefined,'adaptive','off','96-all',
    'baseline','research-600','legacy','legacy',mode);
  const startedHeap=process.memoryUsage().heapUsed;
  let peakHeap=startedHeap;
  for(let i=0;i<ticks;i++){
    scene.world.step();
    if(i%40===0)peakHeap=Math.max(peakHeap,process.memoryUsage().heapUsed);
  }
  const wallMs=performance.now()-started;
  const pupil=scene.students;
  const firstYear=pupil.filter(s=>s.year===1);
  const withTrials=firstYear.filter(s=>scene.world.magicHypotheses(s.id)
    .some(note=>note.trials.length>0));
  const completedTrials=firstYear.reduce((sum,s)=>sum+
    scene.world.magicHypotheses(s.id).reduce((n,h)=>n+h.trials.length,0),0);
  const unfinished=firstYear.filter(s=>scene.world.activeMagicTrial(s.id)!==null)
    .map(s=>({key:s.key,trial:scene.world.activeMagicTrial(s.id)!}));
  if(mode==='living-g4-5'){
    if(pupil.length<600)throw Error('Population is not full 600 pupils');
    if(withTrials.length<2||completedTrials<2)
      throw Error('Research concurrency gate: too few independent science outcomes');
    if(firstYear.filter(s=>scene.world.attendance(s.id)
      .some(l=>l.spell==='wingardium_leviosa'&&l.arrivedAt!==undefined)).length<10)
      throw Error('Missing real shared school attendance');
    const now=scene.world.clock().absoluteMinute;
    if(unfinished.some(x=>now-x.trial.startMinute>=60))
      throw Error('Stalled trial beyond world-time lease');
  }
  return {mode,pupils:pupil.length,teachers:scene.professors.length,ticks,
    wallMs:Math.round(wallMs),msPerTick:Number((wallMs/ticks).toFixed(2)),
    startHeapMiB:Number((startedHeap/1048576).toFixed(1)),
    peakHeapMiB:Number((peakHeap/1048576).toFixed(1)),
    finishedScientists:withTrials.length,completedTrials,
    pendingTrials:unfinished.length};
}
const legacy=measure('legacy');
const science=measure('living-g4-5');
const ratio=Number((science.wallMs/Math.max(1,legacy.wallMs)).toFixed(2));
const result={legacy,science,scienceToLegacyCpuRatio:ratio};
console.log('[G4 SCIENCE 600+] '+JSON.stringify(result,null,2));
if(ratio>8)throw Error('G4.5 research performance > 8x legacy population');
