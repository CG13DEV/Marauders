import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSchoolWeek, reportSchoolWeek, SUBJECTS, HOUSES, ELECTIVES
} from '../src/scenarios/school-week.ts';
import { createPersistentSimulation, restoreCheckpoint } from '../src/core/persistence.ts';

test('seven years, four houses, 14 groups and per-student elective selection', () => {
  const s = createSchoolWeek();
  assert.equal(s.students.length, 84);
  assert.equal(s.professors.length, 12);
  assert.equal(s.teachingGroups.length,14);
  assert.equal(s.sessions.filter(x => SUBJECTS.includes(x.subject as typeof SUBJECTS[number])).length,105);
  assert.equal(new Set(s.students.map(x => x.key)).size,84);
  assert.deepEqual([...new Set(s.students.map(x=>x.year))],[1,2,3,4,5,6,7]);
  assert.equal(new Set(s.students.map(x => x.house)).size,4);
  for (const g of s.teachingGroups) {
    assert.equal(g.students.length,6);
    assert.equal(g.houses.length,2);
    assert.ok(g.students.every(id=>s.students.find(x=>x.id===id)?.year===g.year));
  }
  for(const pupil of s.students) {
    assert.equal(pupil.electives.length,pupil.year>=3?2:0);
    assert.equal(new Set(pupil.electives).size,pupil.electives.length);
    assert.ok(pupil.electives.every(subject=>ELECTIVES.includes(subject)));
    const classes=s.world.attendance(pupil.id);
    assert.ok(classes.length >= 7 && classes.length <= 10);
    const electives=classes.filter(x=>x.groupId?.startsWith('elective_'));
    assert.equal(electives.length,pupil.electives.length);
    assert.equal(new Set(classes.map(x=>x.groupId)).has(pupil.groupId),true);
  }
  const year3=s.students.filter(x=>x.year===3&&x.house==='gryffindor');
  assert.notDeepEqual(year3[0]?.electives,year3[1]?.electives);
});

test('professors, rooms and pupils have no double-bookings during shared curriculum', () => {
  const s=createSchoolWeek();
  const occupiedTeachers=new Set<string>(), occupiedRooms=new Set<string>();
  const occupiedPupils=new Set<string>();
  for (const session of s.sessions) {
    assert.equal(session.room, session.subject in s.classrooms
      ? s.classrooms[session.subject as keyof typeof s.classrooms]
      : s.electiveRooms[session.subject as keyof typeof s.electiveRooms]);
    assert.equal(session.endsAt-session.startsAt,50);
    const teacherKey=session.teacher+':'+session.startsAt;
    const roomKey=session.room+':'+session.startsAt;
    assert.equal(occupiedTeachers.has(teacherKey),false);
    assert.equal(occupiedRooms.has(roomKey),false);
    occupiedTeachers.add(teacherKey); occupiedRooms.add(roomKey);
    for(const pupil of session.students){
      const key=pupil+':'+session.startsAt;
      assert.equal(occupiedPupils.has(key),false);
      occupiedPupils.add(key);
      assert.ok(s.world.attendance(pupil).some(l=>l.id===session.id && l.teacher===session.teacher));
    }
    assert.ok(s.world.attendance(session.teacher).some(l=>l.id===session.id));
  }
  assert.equal(s.sessions.length,155);
  assert.equal(occupiedPupils.size,750);
  for (const professor of s.professors) {
    const lessons=s.world.attendance(professor.id);
    assert.equal(lessons.length,SUBJECTS.includes(professor.subject as typeof SUBJECTS[number])?15:10);
    for(let i=1;i<lessons.length;i++) assert.ok(lessons[i-1]!.endsAt<=lessons[i]!.startsAt);
  }
});

test('two house-paired first-year Charms classes teach Lumos concept, not a generic unlock', () => {
  const s=createSchoolWeek();
  const firstYearCharm=s.sessions.filter(x=>x.subject==='Charms' &&
    x.groupId.startsWith('y1_'));
  assert.ok(firstYearCharm.length>=2);
  assert.equal(new Set(firstYearCharm.map(x=>x.groupId)).size,2);
  assert.equal(new Set(firstYearCharm.flatMap(x=>x.students)).size,12);
  for(const student of s.students.filter(x=>x.year===1)) {
    const spells=s.world.attendance(student.id).filter(x=>x.spell==='lumos');
    assert.equal(spells.length,1);
    assert.equal(spells[0]?.room,s.classrooms.Charms);
  }
});

test('seven day simulation completes grouped lessons and generates social histories', () => {
  const s=createSchoolWeek();
  for(let i=0;i<1008;i++)s.world.step();
  const r=reportSchoolWeek(s);
  assert.equal(r.elapsedTicks,1008);
  assert.equal(r.elapsedDays,7);
  assert.equal(r.pupils,84);
  assert.equal(r.subjects,12);
  assert.equal(r.pupilLessonSlots,750);
  assert.equal(r.teacherLessonSlots,155);
  assert.equal(r.teachingSessions,155);
  assert.equal(r.electiveEnrollments,120);
  assert.equal(r.attendance.pending,0);
  assert.equal(r.attendance.on_time+r.attendance.late+r.attendance.missed,750);
  assert.ok(r.pupilMeals>0 && r.pupilConversations>0 && r.pupilRests>0);
  assert.ok(r.withinHouseConversations>0 && r.acrossHouseConversations>0);
  assert.equal(s.world.clock().label,'08:00');
});

test('individual elective curriculum and lecturer IDs persist in V2 checkpoint', () => {
  const world=createPersistentSimulation();
  const s=createSchoolWeek(world);
  for(let i=0;i<25;i++)world.step();
  const copy=restoreCheckpoint(world.checkpoint());
  assert.deepEqual(copy.captureRuntime(),world.captureRuntime());
  const pupil=s.students.find(x=>x.year===5)!;
  const restored=copy.id(pupil.key)!;
  assert.deepEqual(copy.attendance(restored),world.attendance(pupil.id));
  for(let i=0;i<10;i++){copy.step();world.step();}
  assert.deepEqual(copy.captureRuntime(),world.captureRuntime());
});

test('independent generated school worlds remain deterministic and isolated', () => {
  const first=createSchoolWeek(), second=createSchoolWeek();
  for(let i=0;i<75;i++){first.world.step();second.world.step();}
  assert.deepEqual(reportSchoolWeek(first),reportSchoolWeek(second));
  const pupil=first.students[0]!;
  assert.equal(first.world.execute({
    type:'move',actor:pupil.id,destination:first.layout.dorms[pupil.house].common
  }).ok,true);
  assert.notEqual(first.world.currentRoom(pupil.id),second.world.currentRoom(second.students[0]!.id));
});
