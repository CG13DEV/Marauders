import test from 'node:test';
import assert from 'node:assert/strict';
import {createSchoolWeek,reportSchoolWeek} from '../src/scenarios/school-week.ts';
import {planFoundationTimetable,FOUNDATION_PROFILE,
  FOUNDATION_SUBJECTS,FOUNDATION_TEACHER_LIMIT,FOUNDATION_ROOM_CAPACITY,
  weeklyFoundationSlots} from '../src/scenarios/foundation-timetable.ts';
import {createPersistentSimulation,restoreCheckpoint}
  from '../src/core/persistence.ts';

const scene=()=>createSchoolWeek(createPersistentSimulation(),
  'adaptive','autonomous','96-all','expanded','research-600','foundations-27');

test('#27: a foundation timetable teaches the full 20 / 19 core blocks to each pupil',()=>{
  const s=scene();
  assert.equal(s.students.length,600);
  assert.equal(s.curriculum,'foundations-27');
  assert.equal(s.foundationTeachers.length,13);
  assert.equal(s.foundationSpaces.length,13);
  assert.equal(s.foundationAssignments.length,156);
  assert.equal(s.professors.length,25);
  assert.equal(s.sessions.length,356);
  for(const pupil of s.students.filter(p=>p.year<=2)){
    const personal=s.world.attendance(pupil.id);
    assert.equal(personal.length,pupil.year===1?20:19);
    const yearProfile=FOUNDATION_PROFILE[pupil.year as 1|2];
    for(const [subject,count] of Object.entries(yearProfile)){
      assert.equal(s.foundationAssignments.filter(a=>
        a.groupId===pupil.groupId&&a.subject===subject).length,count,
        'incomplete curriculum: '+pupil.groupId+' / '+subject);
    }
    assert.ok(personal.every(l=>l.startsAt%10===0&&l.endsAt-l.startsAt===50));
    assert.ok(personal.every(l=>[540,600,660,780,840,900]
      .includes(l.startsAt%1440)));
  }
  assert.equal(s.students.filter(p=>p.year===1&&
    s.world.attendance(p.id).filter(l=>l.spell==='lumos').length===1).length,86);
  assert.ok(s.students.filter(p=>p.year>2).every(p=>s.world.attendance(p.id).length>0),
    'older grades retain their partial legacy curriculum');
});

test('#27: every foundation teacher, room and pupil satisfies real interval exclusivity',()=>{
  const s=scene();
  const sessions=s.sessions;
  const clashes=(a:typeof sessions[number],b:typeof sessions[number])=>
    a.startsAt<b.endsAt&&b.startsAt<a.endsAt;
  const caps=new Map(s.foundationSpaces.map(r=>[r.id,r.capacity]));
  const teachers=new Map(s.foundationTeachers.map(t=>[t.id,t]));
  for(const [i,a] of sessions.entries()){
    if(caps.has(a.room)){
      assert.ok(a.students.length<=caps.get(a.room)!);
      const t=teachers.get(a.teacher)!;
      assert.ok(t);
      assert.equal(t.subject,a.subject);
    }
    for(const b of sessions.slice(i+1)){
      if(!clashes(a,b))continue;
      assert.notEqual(a.teacher,b.teacher,'teacher collision: '+a.id+'/'+b.id);
      assert.notEqual(a.room,b.room,'room collision: '+a.id+'/'+b.id);
      assert.ok(!a.students.some(id=>b.students.includes(id)),
        'pupil collision: '+a.id+'/'+b.id);
    }
  }
  for(const teacher of s.foundationTeachers){
    const load=s.foundationAssignments.filter(x=>x.teacher===teacher.id).length;
    assert.ok(load>=1&&load<=FOUNDATION_TEACHER_LIMIT);
  }
  assert.ok(s.foundationSpaces.every(space=>space.capacity===FOUNDATION_ROOM_CAPACITY));
  assert.ok(s.foundationSpaces.every(space=>s.world.roomInfo(space.id)?.loreStatus==='GAME'));
  assert.ok(s.foundationSpaces.every(space=>s.world.exits(space.id).length>0));
  assert.equal(new Set(s.foundationTeachers.map(t=>t.id)).size,13);
});

test('#27: resource shortages fail loudly and never silently delete a required course',()=>{
  const group={id:'g',year:1 as const,students:[1,2,3]};
  const slots=weeklyFoundationSlots();
  assert.throws(()=>planFoundationTimetable({groups:[group],teachers:[],
    spaces:[],slots}),/Insufficient .* teachers/);
  const teachers=FOUNDATION_SUBJECTS.map((subject,index)=>({
    id:index+100,subject,maxPeriods:30
  }));
  assert.throws(()=>planFoundationTimetable({groups:[group],teachers,spaces:[],
    slots}),/No compatible classroom/);
  const spaces=FOUNDATION_SUBJECTS.map((subject,index)=>({
    id:index+1000,subjects:[subject],capacity:2
  }));
  assert.throws(()=>planFoundationTimetable({groups:[group],teachers,
    spaces,slots}),/sufficient capacity/);
  assert.throws(()=>planFoundationTimetable({groups:[group],teachers,
    spaces:spaces.map(x=>({...x,capacity:24})),slots:slots.slice(0,3)}),
    /Insufficient weekly slots/);
});

test('#27: restored full foundation term state resumes deterministically',()=>{
  const s=scene();
  const {world}=s;
  for(let tick=0;tick<24;tick++)world.step();
  const report=reportSchoolWeek(s);
  assert.ok(report.attendance.on_time>0);
  const restored=restoreCheckpoint(world.checkpoint());
  assert.deepEqual(restored.captureRuntime(),world.captureRuntime());
  for(let i=0;i<6;i++){world.step();restored.step();}
  assert.deepEqual(restored.captureRuntime(),world.captureRuntime());
});

test('#27: default 600-person and 84-person school schedules remain untouched',()=>{
  const research=createSchoolWeek(createPersistentSimulation(),
    'adaptive','autonomous','96-all','expanded','research-600');
  assert.equal(research.sessions.length,260);
  assert.equal(research.professors.length,12);
  assert.equal(research.foundationAssignments.length,0);
  const small=createSchoolWeek();
  assert.equal(small.students.length,84);
  assert.equal(small.sessions.length,155);
  assert.throws(()=>createSchoolWeek(undefined,'adaptive','autonomous','control',
    'baseline','fixture-84','foundations-27'),/requires the research population/);
});
