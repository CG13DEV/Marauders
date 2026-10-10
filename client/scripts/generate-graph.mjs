/**
 * BUILD-TIME ONLY. Derive every room, student count and exit from the actual
 * simulation graph. Nothing from Simulation or bitecs is bundled into the
 * browser. No manually mirrored list of dormitories can drift out of sync.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {createPersistentSimulation} from '../../simulation/src/core/persistence.ts';
import {createSchoolWeek} from '../../simulation/src/scenarios/school-week.ts';
import {cohortSize,RESEARCH_DORM_CAPACITY}
  from '../../simulation/src/scenarios/school-population.ts';

const world=createPersistentSimulation();
const scene=createSchoolWeek(world,'adaptive','autonomous',
  '96-all','expanded','research-600','foundations-27','unified-30');
const keyById=new Map(world.captureRuntime().entityKeys.map(([key,id])=>[id,key]));
const common=world.id('dorm_gryffindor');
const landing=world.id('west_landing_4');
if(common===undefined||landing===undefined)throw Error('Gryffindor graph anchor missing');

const room=(id,attributes={})=>{
  const key=keyById.get(id);
  if(key===undefined)throw Error('Unknown room ID '+id);
  return {key,label:world.label(id),...attributes};
};
const research=[];
for(const [slot,rooms] of scene.dormitoryRooms){
  const [year,house,wing]=slot.split(':');
  if(house!=='gryffindor')continue;
  for(let index=0;index<rooms.length;index++){
    const id=rooms[index];
    const occupants=world.occupants(id).filter(actor=>
      scene.students.some(s=>s.id===actor)).length;
    if(occupants<1||occupants>RESEARCH_DORM_CAPACITY)
      throw Error('Wrong room occupation '+slot+'/'+index+': '+occupants);
    research.push(room(id,{
      type:'research',year:Number(year),wing,section:index+1,
      students:occupants,capacity:RESEARCH_DORM_CAPACITY
    }));
  }
}
research.sort((a,b)=>a.year-b.year||
  a.wing.localeCompare(b.wing)||a.section-b.section);
const legacy=['boys_gryffindor','girls_gryffindor']
  .map(key=>world.id(key)).map(id=>{
    if(id===undefined)throw Error('Missing legacy bedroom');
    return room(id,{type:'legacy',capacity:RESEARCH_DORM_CAPACITY,
      students:0,wing:keyById.get(id).startsWith('boys_')?'boys':'girls'});
  });
const ids=[common,landing,...research.map(x=>world.id(x.key)),...legacy.map(x=>world.id(x.key))];
const known=new Set(ids);
const links=[];
for(const id of ids){
  if(id===undefined)throw Error('Unresolved room');
  for(const destination of world.exits(id)){
    if(!known.has(destination))continue;
    const a=keyById.get(id),b=keyById.get(destination);
    if(a<b)links.push([a,b]);
  }
}
const bedroomKeys=[...research,...legacy].map(r=>r.key);
for(const key of bedroomKeys){
  const id=world.id(key);
  const adjacency=world.exits(id).filter(to=>known.has(to)).map(to=>keyById.get(to));
  if(adjacency.length!==1||adjacency[0]!=='dorm_gryffindor')
    throw Error('Bedroom graph topology changed: '+key+': '+adjacency.join(','));
}
const expected=Array.from({length:7},(_,i)=>cohortSize('gryffindor',i+1))
  .reduce((sum,x)=>sum+x,0);
const actual=research.reduce((sum,r)=>sum+r.students,0);
if(expected!==actual)throw Error('Gryffindor bed population mismatch');
const payload={
  schema:'marauders.gryffindor.graph.v1',
  source:{
    layout:'simulation/src/scenarios/castle-layout.ts',
    population:'simulation/src/scenarios/school-population.ts',
    builder:'simulation/src/scenarios/school-week.ts',
    setup:'research-600 / foundations-27 / expanded',
    lore:'CANON describes seven dormitories per wing; this exact research-600 fixture expands each year into several rooms.',
    discrepancy:'simulation floor=4 is a GAME topology placeholder; canonical Gryffindor Tower entrance is on the seventh floor.'
  },
  common:room(common,{type:'common',floor:4}),
  landing:room(landing,{type:'landing',floor:4}),
  research,legacy,links,
  totals:{bedrooms:bedroomKeys.length,researchBedrooms:research.length,
    legacyBedrooms:legacy.length,pupils:actual,
    years:7,capacities:RESEARCH_DORM_CAPACITY}
};
const out=resolve(dirname(fileURLToPath(import.meta.url)),
  '../src/tower-graph.generated.json');
await mkdir(dirname(out),{recursive:true});
await writeFile(out,JSON.stringify(payload,null,2)+'\n','utf8');
console.log('[tower graph] '+payload.totals.bedrooms+' bedroom nodes ('+
  payload.totals.researchBedrooms+' research + '+
  payload.totals.legacyBedrooms+' legacy), '+
  payload.totals.pupils+' Gryffindor pupils, '+payload.links.length+' internal edges');
