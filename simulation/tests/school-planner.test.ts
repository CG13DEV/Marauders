import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/Simulation.ts';
import {
  shortestHops, nextSchoolJourney, nextWeightedSchoolJourney, feasibleMealJourney
} from '../src/core/school-planner.ts';
import { createPersistentSimulation, restoreCheckpoint, restoreSimulation } from '../src/core/persistence.ts';
import { createSchoolWeek, reportSchoolWeek } from '../src/scenarios/school-week.ts';

const lesson = (room: number) => ({
  id:'charms', subject:'Чары', room, startsAt:540, endsAt:590,
  status:'pending' as const
});

test('route estimator handles alternate paths, disconnected destinations and exact hop costs', () => {
  const graph=new Map<number,number[]>([
    [1,[2,3]],[2,[1,4]],[3,[1,5]],[4,[2,5]],[5,[3,4]]
  ]);
  const exits=(room:number)=>graph.get(room)??[];
  assert.equal(shortestHops(1,1,exits),0);
  assert.equal(shortestHops(1,4,exits),2);
  assert.equal(shortestHops(1,5,exits),2);
  assert.equal(shortestHops(1,99,exits),null);
  const future=nextSchoolJourney([lesson(5)],470,1,exits);
  assert.deepEqual({
    departAt:future?.departAt,committed:future?.committed,hops:future?.hops
  },{departAt:510,committed:false,hops:2});
  assert.equal(nextSchoolJourney([lesson(5)],510,1,exits)?.committed,true);
});

test('an adaptive pupil sets out earlier and reaches a distant lesson without teleporting', () => {
  const run=(adaptive:boolean)=>{
    const world=createSimulation();
    const rooms=[world.room('r0','Дом')];
    for(let i=1;i<=5;i++){
      const next=world.room('r'+i,'Коридор '+i);
      world.connect(rooms[i-1]!,next);
      rooms.push(next);
    }
    const isolated=world.room('dining','Столовая вне графа');
    const pupil=world.character('pupil','Ученик',rooms[0]!);
    world.setDailyLife(pupil,{
      homeRoom:rooms[0]!,diningRoom:isolated,
      style:'outgoing',interest:'hobbies',
      ...(adaptive?{schoolPlanning:'adaptive' as const}:{})
    });
    world.setTimetable(pupil,[{id:'test',subject:'Чары',
      room:rooms[5]!,startsAt:540,endsAt:590}]);
    const steps=[];
    for(let i=0;i<11;i++){
      const result=world.step().filter(d=>d.actor===pupil);
      steps.push(result.map(d=>d.action.type));
    }
    return {world,pupil,rooms,steps};
  };
  const aware=run(true), old=run(false);
  assert.equal(aware.world.attendance(aware.pupil)[0]?.status,'on_time');
  assert.equal(old.world.attendance(old.pupil)[0]?.status,'late');
  assert.ok(aware.steps.slice(0,5).every(actions=>actions.length===1 && actions[0]==='move'));
  assert.equal(aware.world.currentRoom(aware.pupil),aware.rooms[5]);
  assert.equal(aware.world.events().filter(event=>
    event.type==='entity_moved' && event.actor===aware.pupil).length,5);
});

test('breakfast is not attempted when its travel would make the next class late', () => {
  const exits=(room:number):number[]=>{
    const graph: Record<number,number[]>={1:[2,3],2:[1],3:[1,4],4:[3,5],5:[4]};
    return graph[room]??[];
  };
  const breakfast=feasibleMealJourney(490,1,2,[],lesson(5),exits);
  assert.equal(breakfast,null);
});

test('a timely lunch may be approached before the meal window, without eating early', () => {
  const exits=(room:number):number[]=>({
    1:[2],2:[1,3],3:[2,4],4:[3]
  } as Record<number,number[]>)[room]??[];
  const classAfter={...lesson(4),id:'afternoon',startsAt:840,endsAt:890};
  const opportunity=feasibleMealJourney(710,1,3,[],classAfter,exits);
  assert.equal(opportunity?.kind,'lunch');
  assert.equal(opportunity?.eatingAt,730);
  assert.equal(feasibleMealJourney(710,1,3,
    [{day:0,kind:'lunch',minute:730}],classAfter,exits),null);
});

test('adaptive daily plan survives journal and materialized checkpoints', () => {
  const world=createPersistentSimulation();
  createSchoolWeek(world,'adaptive');
  for(let i=0;i<32;i++)world.step();
  const revived=restoreCheckpoint(world.checkpoint());
  assert.deepEqual(revived.captureRuntime(),world.captureRuntime());
  for(let i=0;i<35;i++){world.step();revived.step();}
  assert.deepEqual(revived.captureRuntime(),world.captureRuntime());
  const legacyJournal=restoreSimulation(world.snapshot());
  assert.deepEqual(legacyJournal.captureRuntime(),world.captureRuntime());
});

test('the same population yields a fair legacy-vs-adaptive seven-day comparison', () => {
  const before=createSchoolWeek(createSimulation(),'legacy','off');
  const after=createSchoolWeek(createSimulation(),'adaptive','off');
  for(let tick=0;tick<1008;tick++){before.world.step();after.world.step();}
  const original=reportSchoolWeek(before), improved=reportSchoolWeek(after);
  assert.equal(original.pupilLessonSlots,750);
  assert.equal(improved.pupilLessonSlots,750);
  assert.equal(original.attendance.pending,0);
  assert.equal(improved.attendance.pending,0);
  assert.ok(improved.attendance.on_time>original.attendance.on_time,
    'route-aware departure must improve punctuality');
  assert.ok(improved.firstYearKnowsLumos>=original.firstYearKnowsLumos,
    'early departures must not degrade Lumos instruction');
});


test('#30.6: cached weighted school estimate matches legacy search without exposing routes',()=>{
  const exits=new Map([[1,[2]],[2,[1,3]],[3,[2]]]);
  const connections=(room:number)=>exits.get(room)??[];
  const passage=(a:number,b:number)=>Math.abs(a-b)===1?3:null;
  const lessons=[lesson(3)];
  const old=nextWeightedSchoolJourney(lessons,510,1,connections,passage);
  let requests=0;
  const cached=nextWeightedSchoolJourney(lessons,510,1,
    ()=>{throw Error('cached route must not enumerate public or secret exits');},
    ()=>{throw Error('cached route must not recompute passage durations');},10,
    (from,to)=>{
      requests++;
      assert.deepEqual([from,to],[1,3]);
      return {rooms:[1,2,3],minutes:6,hops:2};
    });
  assert.deepEqual(cached,old);
  assert.equal(requests,1);
  const blocked=nextWeightedSchoolJourney(lessons,510,1,connections,passage,
    10,()=>null);
  assert.equal(blocked?.hops,null);
  assert.equal(blocked?.committed,false);
  assert.equal(nextWeightedSchoolJourney([],510,1,connections,passage,
    10,()=>{throw Error('No lesson should not request a route');}),null);
});


test('#30.7: weighted meal feasibility avoids public BFS for rejected candidates',()=>{
  const publicExits=():number[]=>{
    throw Error('A rejected personal meal route must not enumerate the public graph');
  };
  // 07:50: breakfast can be reached, but returning for class would be late.
  const classAtNine={...lesson(3),startsAt:540,endsAt:590};
  const blocked=feasibleMealJourney(470,1,2,[],classAtNine,publicExits,
    (from,to)=>from===2&&to===3?70:10);
  assert.equal(blocked,null);
  // At night all serving windows are too far away regardless of topology.
  assert.equal(feasibleMealJourney(100,1,2,[],null,publicExits,
    ()=>10),null);
  // A personally unreachable dining room must not trigger a public BFS.
  assert.equal(feasibleMealJourney(480,1,2,[],null,publicExits,
    ()=>null),null);
});

test('#30.7: weighted meal still preserves public hop metadata when selected',()=>{
  const publicGraph=new Map<number,number[]>([
    [1,[2]],[2,[1,3]],[3,[2]]
  ]);
  let traversals=0;
  const exits=(room:number)=>{
    traversals++;
    return publicGraph.get(room)??[];
  };
  // The actor knows a direct personal shortcut (10min), but legacy reporting
  // returns two PUBLIC hops. This public metadata must remain stable.
  const weighted=feasibleMealJourney(470,1,3,[],null,exits,()=>10);
  assert.equal(weighted?.kind,'breakfast');
  assert.equal(weighted?.eatingAt,480);
  assert.equal(weighted?.hops,2);
  assert.ok(traversals>0);
  // An isolated dining room reached by a personally known passage keeps the
  // existing cost-to-tick fallback if no public hops exist.
  const isolated=feasibleMealJourney(470,1,99,[],null,
    (room)=>publicGraph.get(room)??[],()=>4);
  assert.equal(isolated?.hops,1);
  // Unweighted legacy callers retain their original public shortest path.
  const legacy=feasibleMealJourney(470,1,3,[],null,
    (room)=>publicGraph.get(room)??[]);
  assert.equal(legacy?.hops,2);
  assert.equal(legacy?.eatingAt,490);
});
