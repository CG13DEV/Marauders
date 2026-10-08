import test from 'node:test';
import assert from 'node:assert/strict';
import { createSchoolWeek, reportSchoolWeek, SUBJECTS, HOUSES, CLASS_STARTS } from '../src/scenarios/school-week.ts';

test('full population has seven cohorts, four houses and a noncolliding teacher schedule', () => {
  const s = createSchoolWeek();
  assert.equal(s.students.length, 84);
  assert.equal(s.professors.length, 7);
  assert.equal(new Set(s.students.map(x => x.key)).size, 84);
  assert.deepEqual(s.students.map(x => x.year).filter((v,i,a) => a.indexOf(v) === i), [1,2,3,4,5,6,7]);
  assert.equal(new Set(s.students.map(x => x.house)).size, 4);
  for (const prof of s.professors) {
    const timetable=s.world.attendance(prof.id);
    assert.equal(timetable.length, 15);
    for(let i=1;i<timetable.length;i++)
      assert.ok(timetable[i-1]!.endsAt <= timetable[i]!.startsAt);
  }
  for (const student of s.students) assert.equal(s.world.attendance(student.id).length,15);
  const monday = s.students.find(x=>x.year===1)!;
  assert.equal(s.world.attendance(monday.id)[0]?.spell,'lumos');
});

test('one simulated teaching week runs, advances time and records curricula for every cohort', () => {
  const s = createSchoolWeek();
  for (let tick=0;tick<6*24*7;tick++) s.world.step();
  const result=reportSchoolWeek(s);
  assert.equal(result.elapsedTicks,1008);
  assert.equal(result.elapsedDays,7);
  assert.equal(result.pupils,84);
  assert.equal(result.pupilLessonSlots,1260);
  assert.equal(result.teacherLessonSlots,105);
  assert.equal(result.attendance.pending,0);
  assert.equal(result.attendance.on_time+result.attendance.late+result.attendance.missed,1260);
  assert.equal(result.firstYearKnowsLumos,12);
  assert.equal(s.world.clock().label,'08:00');
  assert.equal(result.studentsWithMissedLessons,0);
});

test('independent generated schools remain deterministic and isolated', () => {
  const first=createSchoolWeek(), second=createSchoolWeek();
  for(let i=0;i<75;i++) {first.world.step();second.world.step();}
  assert.deepEqual(reportSchoolWeek(first),reportSchoolWeek(second));
  const pupil=first.students[0]!;
  first.world.execute({type:'move',actor:pupil.id,destination:first.hall});
  assert.notEqual(first.world.currentRoom(pupil.id),second.world.currentRoom(second.students[0]!.id));
});
