import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/Simulation.ts';
import {nextRoomOnRoute} from '../src/core/navigation.ts';
import {followPhysicalPassages,MICRO_PASSAGE_MINUTES}
  from '../src/core/physical-travel.ts';
import {nextSchoolJourney} from '../src/core/school-planner.ts';
import {createSchoolWeek} from '../src/scenarios/school-week.ts';
import {createPersistentSimulation,restoreCheckpoint,restoreSimulation}
  from '../src/core/persistence.ts';

test('#28: one ten-minute travel budget crosses actual adjacent passages and real closed door',()=>{
  const w=createSimulation();
  const rooms=Array.from({length:7},(_,i)=>w.room('room'+i,'Комната '+i));
  let lockedDoor=-1;
  for(let i=0;i<rooms.length-1;i++){
    const options=i===2?{door:{key:'real_door',label:'Закрытая дверь',open:false}}:undefined;
    const added=w.connect(rooms[i]!,rooms[i+1]!,options);
    if(i===2)lockedDoor=added!;
  }
  const person=w.character('student','Ученица',rooms[0]!);
  const walk=()=>followPhysicalPassages({
    actor:person,startingRoom:w.currentRoom(person)!,destination:rooms[6]!,
    exits:room=>w.exits(room),nextRoom:nextRoomOnRoute,
    passageAction:(actor,room,next)=>
      room===rooms[2]&&next===rooms[3]&&w.doorIsOpen(lockedDoor)===false
        ?{type:'open_door' as const,actor,door:lockedDoor}
        :{type:'move' as const,actor,destination:next},
    currentRoom:actor=>w.currentRoom(actor),execute:action=>w.execute(action)
  });
  assert.equal(w.doorIsOpen(lockedDoor),false);
  const first=walk();
  assert.equal(first.length,5,'two-minute budget allows five physical commands');
  assert.deepEqual(first.map(x=>x.action.type),
    ['move','move','open_door','move','move']);
  assert.equal(w.currentRoom(person),rooms[4]);
  assert.equal(w.doorIsOpen(lockedDoor),true);
  assert.deepEqual(w.events().filter(e=>e.type==='entity_moved').map(e=>
    e.type==='entity_moved'?[e.from,e.to]:null),[
    [rooms[0],rooms[1]],[rooms[1],rooms[2]],
    [rooms[2],rooms[3]],[rooms[3],rooms[4]]
  ]);
  const second=walk();
  assert.equal(second.length,2);
  assert.equal(w.currentRoom(person),rooms[6]);
  assert.equal(w.events().filter(e=>e.type==='entity_moved').length,6);
  assert.equal(MICRO_PASSAGE_MINUTES,2);
  assert.throws(()=>followPhysicalPassages({
    actor:person,startingRoom:rooms[6]!,destination:rooms[0]!,
    exits:room=>w.exits(room),nextRoom:nextRoomOnRoute,
    passageAction:(actor,room,next)=>({type:'move',actor,destination:next}),
    currentRoom:actor=>w.currentRoom(actor),execute:action=>w.execute(action),
    budgetMinutes:11
  }),/Invalid micro travel budget/);
});

test('#28: departures use short abstract-graph travel without changing 10-minute attendance clock',()=>{
  const lesson={id:'test',subject:'Чары',room:2,
    startsAt:540,endsAt:590,status:'pending' as const};
  const exits=(room:number)=>room===0?[1]:room===1?[0,2]:[1];
  const old=nextSchoolJourney([lesson],510,0,exits)!;
  const micro=nextSchoolJourney([lesson],510,0,exits,10,MICRO_PASSAGE_MINUTES)!;
  assert.equal(old.departAt,510);
  assert.equal(micro.departAt,526);
  assert.equal(old.committed,true);
  assert.equal(micro.committed,false);
  assert.throws(()=>nextSchoolJourney([lesson],510,0,exits,10,0),
    /Invalid passage time/);
});

test('#28: opt-in affects first two year commutes, not the original 600-person fixture',()=>{
  const legacy=createSchoolWeek(createPersistentSimulation(),'adaptive','autonomous',
    '96-all','expanded','research-600','foundations-27');
  const world=createPersistentSimulation();
  const faster=createSchoolWeek(world,'adaptive','autonomous',
    '96-all','expanded','research-600','foundations-27','micro-28');
  assert.equal(faster.travel,'micro-28');
  assert.equal(faster.students.length,600);
  assert.equal(faster.sessions.length,legacy.sessions.length);
  assert.deepEqual(faster.foundationAssignments.map(s=>s.startsAt),
    legacy.foundationAssignments.map(s=>s.startsAt));
  assert.ok(faster.professors.length>12);
  assert.throws(()=>createSchoolWeek(undefined,'adaptive','autonomous',
    'control','baseline','fixture-84','legacy','micro-28'),
    /requires foundations curriculum/);
  let multiMoveTicks=0;
  for(let i=0;i<14;i++){
    const actions=world.step();
    const counts=new Map<number,number>();
    for(const entry of actions){
      if(entry.action.type==='move'||entry.action.type==='open_door'){
        counts.set(entry.actor,(counts.get(entry.actor)??0)+1);
      }
    }
    assert.ok([...counts.values()].every(n=>n<=5),
      'within one school tick a pupil has at most five micro actions');
    if([...counts.values()].some(n=>n>1))multiMoveTicks++;
  }
  assert.ok(multiMoveTicks>0,'real intermediate movements occur within single school tick');
  const saved=restoreCheckpoint(world.checkpoint());
  assert.deepEqual(saved.captureRuntime(),world.captureRuntime());
  for(let i=0;i<3;i++){world.step();saved.step();}
  assert.deepEqual(saved.captureRuntime(),world.captureRuntime());
});

test('#28: V1 operation journal preserves opt-in travel policy on replay',()=>{
  const world=createPersistentSimulation();
  createSchoolWeek(world,'adaptive','autonomous','96-all',
    'expanded','research-600','foundations-27','micro-28');
  for(let i=0;i<3;i++)world.step();
  const replay=restoreSimulation(world.snapshot());
  assert.deepEqual(replay.captureRuntime(),world.captureRuntime());
  for(let i=0;i<2;i++){world.step();replay.step();}
  assert.deepEqual(replay.captureRuntime(),world.captureRuntime());
});
