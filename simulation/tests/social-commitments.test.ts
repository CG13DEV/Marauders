import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/Simulation.ts';
import { createPersistentSimulation, restoreCheckpoint, restoreSimulation } from '../src/core/persistence.ts';

function promiseFixture(schoolFirst = false, persistent = false) {
  const w=persistent?createPersistentSimulation():createSimulation();
  const common=w.room('common','Гостиная');
  const library=w.room('library','Библиотека');
  const classroom=w.room('classroom','Класс');
  w.connect(common,library);
  w.connect(common,classroom);
  const remus=w.character('remus','Ремус',common);
  const pupil=w.character('pupil','Первокурсник',common);
  w.setDailyLife(remus,{
    homeRoom:common,diningRoom:common,style:'outgoing',interest:'lessons',
    commitmentPriority:schoolFirst?'school_first':'promise_first'
  });
  w.setDailyLife(pupil,{
    homeRoom:common,diningRoom:common,style:'reserved',interest:'lessons',
    commitmentPriority:'promise_first'
  });
  return {w,remus,pupil,common,library,classroom};
}

test('an audible physical promise is remembered by both, with future time and room validation',()=>{
  const {w,remus,pupil,library}=promiseFixture();
  const result=w.execute({type:'promise_meeting',actor:remus,listener:pupil,
    room:library,atMinute:540,purpose:'study'});
  assert.equal(result.ok,true);
  assert.equal(w.meetingLedger().length,1);
  assert.equal(w.promiseHistory(remus)[0]?.kind,'promised');
  assert.equal(w.promiseHistory(pupil)[0]?.kind,'heard_promise');
  assert.equal(w.promiseHistory(pupil)[0]?.room,library);
  assert.equal(w.execute({type:'promise_meeting',actor:remus,listener:pupil,
    room:library,atMinute:540,purpose:'study'}).ok,false);
  assert.equal(w.execute({type:'promise_meeting',actor:remus,listener:pupil,
    room:library,atMinute:490,purpose:'study'}).ok,false);
  const copied=w.promiseHistory(pupil);
  copied[0]!.partner=-999;
  assert.equal(w.promiseHistory(pupil)[0]?.partner,remus);
});

test('both characters independently travel one edge, and meeting is fulfilled without teleportation',()=>{
  const {w,remus,pupil,library}=promiseFixture();
  w.execute({type:'promise_meeting',actor:remus,listener:pupil,
    room:library,atMinute:540,purpose:'study'});
  for(let i=0;i<7;i++)w.step();
  assert.equal(w.currentRoom(remus),library);
  assert.equal(w.currentRoom(pupil),library);
  assert.equal(w.meetingLedger()[0]?.status,'kept');
  assert.equal(w.promiseHistory(remus).at(-1)?.kind,'met');
  assert.equal(w.promiseHistory(pupil).at(-1)?.kind,'met');
  assert.equal(w.events().filter(x=>x.type==='meeting_resolved').length,1);
});

test('if one waits alone, ONLY that witness can conclude they were abandoned',()=>{
  const {w,remus,pupil,library}=promiseFixture();
  w.setManualControl(remus,true);
  w.execute({type:'promise_meeting',actor:remus,listener:pupil,
    room:library,atMinute:540,purpose:'study'});
  for(let i=0;i<9;i++)w.step();
  assert.equal(w.currentRoom(remus),w.id('common'));
  assert.equal(w.currentRoom(pupil),library);
  assert.equal(w.meetingLedger()[0]?.status,'expired');
  assert.equal(w.promiseHistory(pupil).at(-1)?.kind,'waited_alone');
  assert.equal(w.promiseHistory(remus).length,1);
  assert.ok(!w.promiseHistory(remus).some(x=>x.kind==='waited_alone'));
});

test('an absence nobody witnesses does not fabricate a personal grudge',()=>{
  const {w,remus,pupil,library}=promiseFixture();
  w.setManualControl(remus,true);
  w.setManualControl(pupil,true);
  w.execute({type:'promise_meeting',actor:remus,listener:pupil,
    room:library,atMinute:540,purpose:'study'});
  for(let i=0;i<9;i++)w.step();
  assert.equal(w.meetingLedger()[0]?.status,'expired');
  assert.equal(w.promiseHistory(remus).length,1);
  assert.equal(w.promiseHistory(pupil).length,1);
});

test('a person can prioritize a promise over class, or consciously keep school first',()=>{
  const run=(schoolFirst:boolean)=>{
    const scene=promiseFixture(schoolFirst);
    const {w,remus,pupil,library,classroom}=scene;
    w.setTimetable(remus,[{
      id:'class',subject:'Чары',room:classroom,startsAt:520,endsAt:580
    }]);
    w.execute({type:'promise_meeting',actor:remus,listener:pupil,
      room:library,atMinute:540,purpose:'study'});
    for(let i=0;i<12;i++)w.step();
    return {w,remus,pupil};
  };
  const school=run(true);
  const promise=run(false);
  assert.equal(school.w.attendance(school.remus)[0]?.status,'on_time');
  assert.equal(school.w.meetingLedger()[0]?.status,'expired');
  assert.equal(school.w.promiseHistory(school.pupil).at(-1)?.kind,'waited_alone');
  assert.equal(promise.w.meetingLedger()[0]?.status,'kept');
  assert.equal(promise.w.attendance(promise.remus)[0]?.status,'missed');
});

test('spell explanation requires the teacher physically present at teaching moment',()=>{
  const run=(teacherInRoom:boolean)=>{
    const w=createSimulation();
    const room=w.room('class','Класс'), corridor=w.room('corridor','Коридор');
    w.connect(room,corridor);
    const teacher=w.character('teacher','Преподаватель',teacherInRoom?room:corridor);
    const student=w.character('student','Первокурсник',room);
    if(!teacherInRoom)w.setManualControl(teacher,true);
    w.setTimetable(student,[{
      id:'charms',subject:'Чары',room,teacher,
      startsAt:520,endsAt:570,spell:'lumos'
    }]);
    for(let i=0;i<5;i++)w.step(); // teaching minute = 530
    return {w,teacher,student};
  };
  const without=run(false),withTeacher=run(true);
  assert.equal(without.w.attendance(without.student)[0]?.status,'on_time');
  assert.equal(without.w.spellStage(without.student,'lumos'),'unaware');
  assert.equal(withTeacher.w.spellStage(withTeacher.student,'lumos'),'conceptual');
});

test('personal promise memory and future choice persist through both save mechanisms',()=>{
  const {w,remus,pupil,library}=promiseFixture(false,true);
  w.execute({type:'promise_meeting',actor:remus,listener:pupil,
    room:library,atMinute:540,purpose:'study'});
  for(let i=0;i<3;i++)w.step();
  const replay=restoreSimulation(w.snapshot());
  const checkpoint=restoreCheckpoint(w.checkpoint());
  assert.deepEqual(checkpoint.captureRuntime(),w.captureRuntime());
  assert.deepEqual(replay.captureRuntime(),w.captureRuntime());
  for(let i=0;i<7;i++){replay.step();checkpoint.step();w.step();}
  assert.deepEqual(checkpoint.captureRuntime(),w.captureRuntime());
  assert.deepEqual(replay.captureRuntime(),w.captureRuntime());
  assert.equal(w.promiseHistory(pupil).at(-1)?.kind,'met');
});

test('promise state never leaks across parallel worlds',()=>{
  const a=promiseFixture(),b=promiseFixture();
  a.w.execute({type:'promise_meeting',actor:a.remus,listener:a.pupil,
    room:a.library,atMinute:540,purpose:'explore'});
  assert.equal(a.w.meetingLedger().length,1);
  assert.deepEqual(b.w.meetingLedger(),[]);
  assert.deepEqual(b.w.promiseHistory(b.pupil),[]);
});
