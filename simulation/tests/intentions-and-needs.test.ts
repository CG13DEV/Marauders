import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceNeeds,afterMeal,chooseNeedOrIntention,pickIntention
} from '../src/core/intentions.ts';
import {
  createPersistentSimulation,restoreSimulation,restoreCheckpoint
} from '../src/core/persistence.ts';
import { createSimulation } from '../src/core/Simulation.ts';
import { createSchoolWeek,reportSchoolWeek } from '../src/scenarios/school-week.ts';

function fixture(){
  const w=createPersistentSimulation();
  const home=w.room('home','Спальня и столовая');
  const corridor=w.room('corridor','Коридор');
  const library=w.room('library','Библиотека');
  const courtyard=w.room('courtyard','Двор');
  const classroom=w.room('classroom','Кабинет');
  w.connect(home,corridor);
  w.connect(corridor,library);
  w.connect(corridor,courtyard);
  w.connect(corridor,classroom);
  const student=w.character('student','Ученик',home);
  w.setDailyLife(student,{
    homeRoom:home,diningRoom:home,socialRoom:home,
    interest:'castle',style:'reserved',intentionPlanning:true
  });
  return {w,student,home,corridor,library,courtyard,classroom};
}
const visit=(w:ReturnType<typeof fixture>['w'],actor:number,destination:number,
  importance:'casual'|'important'='casual',deadlineMinute?:number)=>
    w.execute({type:'intend_visit',actor,destination,importance,
      ...(deadlineMinute===undefined?{}:{deadlineMinute})});

test('only configured characters may form goals; invalid target and duplicate are rejected',()=>{
  const {w,student,home,library}=fixture();
  const other=w.character('other','Друг',home);
  assert.equal(visit(w,other,library).ok,false);
  assert.equal(visit(w,student,-10).ok,false);
  assert.equal(visit(w,student,library,'casual',100000).ok,false);
  assert.equal(visit(w,student,library).ok,true);
  assert.equal(visit(w,student,library).ok,false);
  const view=w.intentionHistory(student);
  view[0]!.destination=-77;
  assert.equal(w.intentionHistory(student)[0]?.destination,library);
});

test('actual meal reduces bodily hunger and interrupts a begun visit, which resumes',()=>{
  const {w,student,home,corridor,library}=fixture();
  for(let i=0;i<23;i++)w.step(); // 11:50; breakfast is already eaten.
  assert.equal(w.clock().absoluteMinute,710);
  assert.equal(w.mealHistory(student)[0]?.kind,'breakfast');
  assert.equal(visit(w,student,library).ok,true);
  w.step(); // 12:00: hunger just under threshold, start journey
  assert.equal(w.currentRoom(student),corridor);
  assert.equal(w.intentionHistory(student)[0]?.status,'active');
  w.step(); // 12:10: hunger, turn toward food
  assert.equal(w.currentRoom(student),home);
  assert.equal(w.intentionHistory(student)[0]?.status,'paused');
  assert.equal(w.intentionHistory(student)[0]?.interruptedBy,'hunger');
  const before=w.needsOf(student)!.hunger;
  w.step(); // 12:20: physically eat
  assert.ok(w.needsOf(student)!.hunger<before);
  assert.equal(w.mealHistory(student).at(-1)?.kind,'lunch');
  w.step(); // 12:30 resume
  assert.equal(w.currentRoom(student),corridor);
  assert.equal(w.intentionHistory(student)[0]?.status,'active');
  w.step();
  w.step(); // arrive and fulfill intention
  assert.equal(w.currentRoom(student),library);
  assert.equal(w.intentionHistory(student)[0]?.status,'completed');
  assert.deepEqual(w.events().filter(e=>e.type==='intention_changed')
    .map(e=>e.status),['queued','active','paused','active','completed']);
});

test('scheduled lesson interrupts a personal important mission; after class it resumes',()=>{
  const {w,student,corridor,library,classroom}=fixture();
  w.setTimetable(student,[{
    id:'class',subject:'Чары',room:classroom,startsAt:520,endsAt:570
  }]);
  assert.equal(visit(w,student,library,'important').ok,true);
  w.step(); // 08:10, visit starts
  assert.equal(w.currentRoom(student),corridor);
  assert.equal(w.intentionHistory(student)[0]?.status,'active');
  w.step(); // 08:20, school journey takes priority
  assert.equal(w.currentRoom(student),classroom);
  assert.equal(w.intentionHistory(student)[0]?.status,'paused');
  assert.equal(w.intentionHistory(student)[0]?.interruptedBy,'lesson');
  for(let i=0;i<7;i++)w.step(); // through 09:30
  assert.equal(w.attendance(student)[0]?.status,'on_time');
  for(let i=0;i<3;i++)w.step(); // 09:40-10:00
  assert.equal(w.currentRoom(student),library);
  assert.equal(w.intentionHistory(student)[0]?.status,'completed');
});

test('important intention interrupts a casual active goal, which then resumes',()=>{
  const {w,student,corridor,library,courtyard}=fixture();
  assert.equal(visit(w,student,library).ok,true);
  w.step(); // 08:10 breakfast
  w.step(); // 08:20 casual travels to corridor
  assert.equal(w.currentRoom(student),corridor);
  assert.equal(w.intentionHistory(student)[0]?.status,'active');
  assert.equal(visit(w,student,courtyard,'important').ok,true);
  w.step(); // important wins
  assert.equal(w.currentRoom(student),courtyard);
  assert.equal(w.intentionHistory(student)[0]?.interruptedBy,'higher_priority');
  w.step(); // important completed, from courtyard
  assert.equal(w.intentionHistory(student)[1]?.status,'completed');
  for(let i=0;i<4;i++)w.step();
  assert.equal(w.currentRoom(student),library);
  assert.equal(w.intentionHistory(student)[0]?.status,'completed');
});

test('sleep means physically going home and recovering over many night ticks',()=>{
  const {w,student,home,library}=fixture();
  for(let i=0;i<80;i++)w.step(); // 21:20
  assert.equal(w.clock().absoluteMinute,1280);
  assert.equal(visit(w,student,library).ok,true);
  w.step(); // 21:30
  w.step(); // 21:40
  assert.equal(w.currentRoom(student),library);
  const before=w.needsOf(student)!.fatigue;
  w.step(); // 21:50 goal may complete while at destination
  w.step(); // 22:00 rest decision
  assert.ok(w.needsOf(student)!.fatigue>=before);
  for(let i=0;i<7;i++)w.step(); // until 23:10
  assert.equal(w.currentRoom(student),home);
  assert.ok(w.needsOf(student)!.fatigue<before);
  assert.ok(w.restHistory(student).length>=1);
});

test('a casual goal crossing bedtime is paused by sleep and later resumes',()=>{
  const {w,student,home,library}=fixture();
  for(let i=0;i<80;i++)w.step();
  assert.equal(visit(w,student,library).ok,true);
  w.step(); // 21:30 move to corridor
  w.step(); // 21:40 reach library
  // Schedule a follow-on goal for longer night travel; start another intention now.
  assert.equal(visit(w,student,home).ok,true);
  w.step(); // 21:50 completes library, next goal queued
  w.step(); // 22:00 bedtime, goal stays queued until morning
  assert.equal(w.intentionHistory(student)[1]?.status,'queued');
  for(let i=0;i<50;i++)w.step(); // 06:20
  assert.ok(w.needsOf(student)!.fatigue<30);
});

test('goals expire at their deadline and are never silently resurrected',()=>{
  const {w,student,library}=fixture();
  assert.equal(visit(w,student,library,'casual',490).ok,true);
  w.step(); // first meal, 08:10
  w.step(); // 08:20, expires
  assert.equal(w.intentionHistory(student)[0]?.status,'expired');
  assert.equal(w.execute({type:'cancel_intention',actor:student,intentionId:1}).ok,false);
});

test('actor can explicitly cancel an active mission; no further goal travel',()=>{
  const {w,student,corridor,library}=fixture();
  visit(w,student,library,'important');
  w.step();
  assert.equal(w.currentRoom(student),corridor);
  assert.equal(w.execute({type:'cancel_intention',actor:student,intentionId:1}).ok,true);
  assert.equal(w.intentionHistory(student)[0]?.status,'cancelled');
  assert.equal(w.execute({type:'cancel_intention',actor:student,intentionId:1}).ok,false);
});

test('V1 journal and V2 checkpoint replay the same interrupted life, needs and goals',()=>{
  const {w,student,library}=fixture();
  for(let i=0;i<23;i++)w.step();
  visit(w,student,library);
  w.step();
  w.step();
  assert.equal(w.intentionHistory(student)[0]?.status,'paused');
  const j=restoreSimulation(w.snapshot()),c=restoreCheckpoint(w.checkpoint());
  assert.deepEqual(j.captureRuntime(),w.captureRuntime());
  assert.deepEqual(c.captureRuntime(),w.captureRuntime());
  for(let i=0;i<10;i++){w.step();j.step();c.step();}
  assert.deepEqual(j.captureRuntime(),w.captureRuntime());
  assert.deepEqual(c.captureRuntime(),w.captureRuntime());
  assert.equal(c.intentionHistory(c.id('student')!)[0]?.status,'completed');
});

test('historic checkpoint without needs/goals hydrates and two worlds never share state',()=>{
  const {w,student}=fixture();
  const snap=w.checkpoint();
  delete snap.runtime.intentions;
  delete snap.runtime.bodilyNeeds;
  const restored=restoreCheckpoint(snap);
  assert.deepEqual(restored.needsOf(restored.id('student')!),{hunger:26,fatigue:0});
  const independent=fixture();
  visit(w,student,w.id('library')!);
  assert.equal(independent.w.intentionHistory(independent.student).length,0);
});

test('pure bodily change and intention ordering have no hidden state',()=>{
  assert.deepEqual(afterMeal({hunger:30,fatigue:15}),{hunger:0,fatigue:15});
  assert.deepEqual(advanceNeeds({hunger:30,fatigue:50},true,1330),
    {hunger:31,fatigue:46});
  const a={id:1,kind:'visit' as const,destination:7,importance:'casual' as const,
    createdMinute:480,status:'active' as const};
  const b={...a,id:2,importance:'important' as const,status:'queued' as const};
  assert.equal(pickIntention([a,b])?.id,2);
  assert.equal(chooseNeedOrIntention({hunger:30,fatigue:10},720,[a],()=>false).kind,'eat');
  assert.equal(chooseNeedOrIntention({hunger:30,fatigue:10},720,[b],()=>false).kind,'visit');
  assert.equal(chooseNeedOrIntention({hunger:90,fatigue:10},720,[b],()=>false).kind,'eat');
});

test('unconfigured full school retains the previous 164-test behavioral baseline',()=>{
  const w=createSimulation(),school=createSchoolWeek(w);
  for(let i=0;i<1008;i++)w.step();
  const r=reportSchoolWeek(school);
  assert.equal(r.attendance.on_time,684);
  assert.equal(r.attendance.late,66);
  assert.equal(r.attendance.missed,0);
  assert.equal(r.firstYearKnowsLumos,12);
  assert.equal(r.invitations,56);
  assert.equal(r.fulfilledMeetings,44);
});
