import test from 'node:test';
import assert from 'node:assert/strict';
import {createPersistentSimulation,restoreCheckpoint,restoreSimulation}
  from '../src/core/persistence.ts';
import {shortestWeightedRoute,nextWeightedRoom}
  from '../src/core/weighted-navigation.ts';
import {followPhysicalPassages} from '../src/core/physical-travel.ts';
import {nextWeightedSchoolJourney}
  from '../src/core/school-planner.ts';
import {createSchoolWeek} from '../src/scenarios/school-week.ts';

test('#29: more rooms can be faster than fewer rooms',()=>{
  const cost=new Map(['1:2','2:4'].map(k=>[k,8]));
  cost.set('1:3',2);cost.set('3:5',2);cost.set('5:4',2);
  const graph=new Map([[1,[2,3]],[2,[1,4]],[3,[1,5]],[5,[3,4]],[4,[2,5]]]);
  const minutes=(a:number,b:number)=>cost.get(Math.min(a,b)+':'+Math.max(a,b))??null;
  const exits=(id:number)=>graph.get(id)??[];
  assert.deepEqual(shortestWeightedRoute(1,4,exits,minutes),
    {rooms:[1,3,5,4],minutes:6,hops:3});
  assert.equal(nextWeightedRoom(1,4,exits,minutes),3);
  assert.deepEqual(shortestWeightedRoute(1,1,exits,minutes),
    {rooms:[1],minutes:0,hops:0});
  assert.equal(shortestWeightedRoute(1,999,exits,minutes),null);
  assert.throws(()=>shortestWeightedRoute(1,4,exits,
    (a,b)=>a===1&&b===2?0:minutes(a,b)),/Invalid weighted passage/);
});

function secrets(){
  const world=createPersistentSimulation();
  const a=world.room('a','Вход');
  const b=world.room('b','Длинная лестница');
  const c=world.room('c','Восточная галерея');
  const d=world.room('d','Кабинет');
  world.connect(a,b,{travelMinutes:8});
  world.connect(b,d,{travelMinutes:8});
  world.connect(a,c,{travelMinutes:4});
  world.connect(c,d,{travelMinutes:4});
  world.connect(a,d,{hidden:true,travelMinutes:2});
  const remus=world.character('remus','Ремус',a);
  const sirius=world.character('sirius','Сириус',a);
  const exits=(actor:number)=>(place:number)=>world.knownExits(actor,place);
  const price=(actor:number)=>(from:number,to:number)=>
    world.passageMinutes(actor,from,to);
  return {world,a,b,c,d,remus,sirius,exits,price};
}

test('#29: secret passage has real utility only for a local discoverer',()=>{
  const {world,a,c,d,remus,sirius,exits,price}=secrets();
  assert.equal(world.passageMinutes(remus,a,d),null);
  assert.ok(!world.exits(a).includes(d),'secret must remain invisible in public graph');
  assert.ok(!world.knownExits(remus,a).includes(d));
  assert.deepEqual(shortestWeightedRoute(a,d,exits(remus),price(remus)),
    {rooms:[a,c,d],minutes:8,hops:2});
  assert.deepEqual(world.execute({type:'move',actor:remus,destination:d}),
    {ok:false,reason:'unknown_passage',events:[]});
  const searched=world.execute({type:'search_passages',actor:sirius});
  assert.equal(searched.ok,true);
  assert.equal(searched.events.length,1);
  assert.equal(searched.events[0]?.type,'passage_discovered');
  assert.ok(world.knownExits(sirius,a).includes(d));
  assert.equal(world.passageMinutes(sirius,a,d),2);
  assert.equal(world.passageMinutes(remus,a,d),null);
  assert.deepEqual(shortestWeightedRoute(a,d,exits(sirius),price(sirius)),
    {rooms:[a,d],minutes:2,hops:1});
  assert.ok(!world.knownExits(remus,a).includes(d));
  const moved=world.execute({type:'move',actor:sirius,destination:d});
  assert.equal(moved.ok,true);
  assert.ok(world.events().some(e=>e.type==='entity_moved'&&
    e.actor===sirius&&e.from===a&&e.to===d));
  assert.equal(world.execute({type:'search_passages',actor:sirius}).events.length,0);
});

test('#29: only physically local sighted characters can find hidden exits',()=>{
  const {world,a,d,remus,sirius}=secrets();
  assert.throws(()=>world.connect(a,d,{travelMinutes:2}),/already exists/);
  assert.throws(()=>world.connect(a,d,{travelMinutes:0}),/already exists/);
  const remote=world.room('remote','Удалённая комната');
  const blind=world.character('blind','Незрячий',remote,{vision:false,hearing:true});
  assert.deepEqual(world.execute({type:'search_passages',actor:blind}),
    {ok:false,reason:'cannot_search_passages',events:[]});
  world.execute({type:'search_passages',actor:remus});
  assert.equal(world.passageMinutes(sirius,a,d),null);
  assert.equal(world.execute({type:'search_passages',actor:sirius}).events.length,1);
});

test('#29: weighted travel pays actual corridor and door times, not hop count',()=>{
  const {world,a,d,sirius,exits,price}=secrets();
  // Sirius knows a direct 2-minute secret passage, while another character
  // needs two 4-minute ordinary passages (8 total).
  world.execute({type:'search_passages',actor:sirius});
  const actions=followPhysicalPassages({
    actor:sirius,startingRoom:a,destination:d,
    exits:exits(sirius),nextRoom:(from,to,x)=>
      nextWeightedRoom(from,to,x,price(sirius)),
    passageAction:(actor,room,next)=>({type:'move',actor,destination:next}),
    currentRoom:actor=>world.currentRoom(actor),execute:cmd=>world.execute(cmd),
    passageMinutes:price(sirius)
  });
  assert.deepEqual(actions.map(x=>x.action.type),['move']);
  assert.equal(world.currentRoom(sirius),d);
  const lesson={id:'class',subject:'Чары',room:d,
    startsAt:540,endsAt:590,status:'pending' as const};
  const plan=nextWeightedSchoolJourney([lesson],530,a,
    exits(sirius),price(sirius));
  assert.equal(plan?.departAt,528);
});

test('#29: discovery and weighted topology survive both V1 and V2 across replay',()=>{
  const {world,a,d,sirius,remus}=secrets();
  world.execute({type:'search_passages',actor:sirius});
  const cp=restoreCheckpoint(world.checkpoint());
  const jr=restoreSimulation(world.snapshot());
  assert.deepEqual(cp.captureRuntime(),world.captureRuntime());
  assert.deepEqual(jr.captureRuntime(),world.captureRuntime());
  for(const w of [world,cp,jr]){
    assert.equal(w.passageMinutes(sirius,a,d),2);
    assert.equal(w.passageMinutes(remus,a,d),null);
    assert.equal(w.execute({type:'move',actor:sirius,destination:d}).ok,true);
    assert.deepEqual(w.passageDiscoveries(sirius),[[a,d]]);
  }
  assert.deepEqual(cp.captureRuntime(),world.captureRuntime());
  assert.deepEqual(jr.captureRuntime(),world.captureRuntime());
});

test('#29: canonical Hogwarts has uneven public stairs and GAME secret access',()=>{
  const w=createPersistentSimulation();
  const school=createSchoolWeek(w,'adaptive','autonomous','96-all',
    'expanded','research-600','foundations-27','weighted-29');
  assert.equal(school.students.length,600);
  assert.equal(school.travel,'weighted-29');
  const a=school.layout.landings[4].west;
  const d=school.layout.landings[0].west;
  const pupil=school.students.find(p=>p.year===1&&p.house==='gryffindor')!.id;
  assert.equal(w.passageMinutes(pupil,a,d),null);
  assert.equal(w.passageMinutes(pupil,school.layout.landings[4].west,
    school.layout.landings[3].west),4);
  assert.ok(!w.exits(a).includes(d));
  assert.ok(w.knownExits(pupil,a).includes(school.layout.landings[3].west));
  // Nobody automatically knows the passage from the other side of the castle.
  assert.equal(w.passageDiscoveries(pupil).length,0);
});
