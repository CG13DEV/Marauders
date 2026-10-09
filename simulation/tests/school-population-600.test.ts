import test from 'node:test';
import assert from 'node:assert/strict';
import {createSchoolWeek,reportSchoolWeek} from '../src/scenarios/school-week.ts';
import {HOUSES} from '../src/scenarios/curriculum.ts';
import {RESEARCH_SCHOOL_POPULATION,RESEARCH_DORM_CAPACITY,
  cohortSize,populationSummary} from '../src/scenarios/school-population.ts';
import {createPersistentSimulation,restoreCheckpoint}
  from '../src/core/persistence.ts';

const research=(world=createPersistentSimulation())=>
  createSchoolWeek(world,'adaptive','autonomous','96-all','expanded','research-600');

test('demographics: 600 synthetic pupils, 85–86 per year, 150 per house, 20–23 per cohort',()=>{
  const summary=populationSummary();
  assert.equal(summary.total,RESEARCH_SCHOOL_POPULATION);
  assert.deepEqual(summary.years,[86,86,86,86,85,85,86]);
  for(const house of HOUSES){
    assert.equal(summary.houses[house],150);
    for(let year=1;year<=7;year++){
      const n=cohortSize(house,year);
      assert.ok(n>=20&&n<=23);
    }
  }
  assert.throws(()=>cohortSize('gryffindor',0),/school year/);
  assert.throws(()=>cohortSize('gryffindor',8),/school year/);
});

test('600 students inhabit bounded year/sex bedrooms and classes without double-booking',()=>{
  const scene=research();
  const {world,students,professors,teachingGroups,sessions}=scene;
  assert.equal(scene.scale,'research-600');
  assert.equal(students.length,600);
  assert.equal(professors.length,12);
  assert.equal(scene.residents!.people.length,9);
  assert.equal(teachingGroups.length,28);
  assert.equal(sessions.filter(x=>x.groupId.startsWith('y')).length,210);
  assert.equal(sessions.length,260); // 210 core + 50 elective workshops
  assert.equal(scene.population.pupils,600);
  const counts=new Map<number,number>();
  for(const student of students){
    counts.set(student.dormRoom,(counts.get(student.dormRoom)??0)+1);
    assert.equal(world.currentRoom(student.id),student.dormRoom);
    assert.equal(world.roomInfo(student.dormRoom)?.kind,'bedroom');
    assert.equal(world.roomInfo(student.dormRoom)?.house,student.house);
    assert.equal(student.groupId,'y'+student.year+'_'+student.house);
    assert.ok(world.attendance(student.id).length>=7);
    assert.ok(world.attendance(student.id).length<=10);
    assert.ok(world.toiletState(student.id));
  }
  assert.equal([...counts.values()].reduce((a,b)=>a+b,0),600);
  assert.ok([...counts.values()].every(n=>n>=1&&n<=RESEARCH_DORM_CAPACITY));
  assert.equal(scene.dormitoryRooms.size,56);
  for(const group of teachingGroups){
    assert.equal(group.houses.length,1);
    assert.equal(group.students.length,cohortSize(group.houses[0]!,group.year));
    assert.ok(group.students.length<=23);
  }
  const teachers=new Set<string>(),rooms=new Set<string>(),pupils=new Set<string>();
  for(const session of sessions){
    assert.ok(session.students.length<=23,'never put forty students in one classroom');
    const t=session.teacher+':'+session.startsAt;
    const r=session.room+':'+session.startsAt;
    assert.ok(!teachers.has(t),'teacher double-booked: '+session.id);
    assert.ok(!rooms.has(r),'room double-booked: '+session.id);
    teachers.add(t);rooms.add(r);
    for(const actor of session.students){
      const key=actor+':'+session.startsAt;
      assert.ok(!pupils.has(key),'pupil double-booked: '+session.id);
      pupils.add(key);
    }
  }
  // A cohort on the 8-period track may study Charms twice. All four
  // first-year Houses must nonetheless get the introductory lesson.
  assert.equal(new Set(sessions.filter(x=>x.subject==='Charms'&&
    x.groupId.startsWith('y1_')).map(x=>x.groupId)).size,4);
  assert.equal(students.filter(x=>x.year===1&&
    world.attendance(x.id).some(l=>l.spell==='lumos')).length,86);
});

test('real 600-person world advances, attends classes and restores a V2 checkpoint deterministically',()=>{
  const world=createPersistentSimulation();
  const scene=research(world);
  for(let i=0;i<24;i++)world.step(); // 08:00 -> noon, physical lessons/meal journeys
  const report=reportSchoolWeek(scene);
  assert.equal(report.pupils,600);
  assert.equal(report.teachingSessions,260);
  assert.ok(report.attendance.on_time>0);
  assert.ok(world.events().some(e=>e.type==='entity_moved'));
  assert.ok(world.events().some(e=>e.type==='lesson_attendance'));
  const cp=restoreCheckpoint(world.checkpoint());
  assert.deepEqual(cp.captureRuntime(),world.captureRuntime());
  for(let i=0;i<6;i++){world.step();cp.step();}
  assert.deepEqual(cp.captureRuntime(),world.captureRuntime());
});

test('old 84-pupil teaching fixture is unchanged when new scale is not requested',()=>{
  const scene=createSchoolWeek();
  assert.equal(scene.scale,'fixture-84');
  assert.equal(scene.students.length,84);
  assert.equal(scene.teachingGroups.length,14);
  assert.equal(scene.sessions.length,155);
  assert.equal(scene.dormitoryRooms.size,0);
});
