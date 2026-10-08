import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersistentSimulation, restoreCheckpoint, restoreSimulation } from '../src/core/persistence.ts';
import { createSimulation } from '../src/core/Simulation.ts';
import { createSchoolWeek, reportSchoolWeek } from '../src/scenarios/school-week.ts';

function invitationFixture(responder: 'outgoing'|'reserved'='outgoing',purpose:'study'|'explore'='study'){
  const w=createPersistentSimulation();
  const lounge=w.room('lounge','Гостиная');
  const library=w.room('library','Библиотека');
  w.connect(lounge,library);
  const a=w.character('initiator','Инициатор',lounge);
  const b=w.character('recipient','Собеседник',lounge);
  w.setDailyLife(a,{
    homeRoom:lounge,diningRoom:lounge,
    socialRoom:lounge,style:'outgoing',
    interest:purpose==='study'?'lessons':'castle',
    socialInvitations:true
  });
  w.setDailyLife(b,{
    homeRoom:lounge,diningRoom:lounge,
    socialRoom:lounge,style:responder,
    interest:'lessons',socialInvitations:true
  });
  return {w,a,b,lounge,library};
}

test('a social invitation is heard but NOT a binding promise until accepted',()=>{
  const {w,a,b,library}=invitationFixture();
  const answer=w.execute({type:'offer_meeting',actor:a,listener:b,
    room:library,atMinute:2620,purpose:'study'});
  assert.equal(answer.ok,true);
  assert.equal(w.meetingLedger()[0]?.status,'offered');
  assert.deepEqual(w.promiseHistory(a).map(x=>x.kind),['offered']);
  assert.deepEqual(w.promiseHistory(b).map(x=>x.kind),['invited']);
  assert.equal(w.execute({type:'answer_meeting',actor:a,meetingId:1,accept:true}).ok,false);
  assert.equal(w.execute({type:'answer_meeting',actor:b,meetingId:1,accept:true}).ok,true);
  assert.equal(w.meetingLedger()[0]?.status,'pending');
  assert.deepEqual(w.promiseHistory(a).map(x=>x.kind),['offered','accepted']);
  assert.deepEqual(w.promiseHistory(b).map(x=>x.kind),['invited','accepted']);
  assert.equal(w.execute({type:'answer_meeting',actor:b,meetingId:1,accept:false}).ok,false);
});

test('the invitee may refuse explicitly without an invented broken promise',()=>{
  const {w,a,b,library}=invitationFixture('reserved','explore');
  w.execute({type:'offer_meeting',actor:a,listener:b,
    room:library,atMinute:2620,purpose:'explore'});
  assert.equal(w.execute({type:'answer_meeting',actor:b,meetingId:1,accept:false}).ok,true);
  assert.equal(w.meetingLedger()[0]?.status,'declined');
  for(let i=0;i<230;i++)w.step();
  assert.equal(w.meetingLedger()[0]?.status,'declined');
  assert.ok(!w.promiseHistory(b).some(x=>x.kind==='waited_alone'));
});

test('a remote answer is rejected; an unheard answer cannot be telepathic',()=>{
  const {w,a,b,library}=invitationFixture();
  w.execute({type:'offer_meeting',actor:a,listener:b,
    room:library,atMinute:2620,purpose:'study'});
  assert.equal(w.execute({type:'move',actor:b,destination:library}).ok,true);
  const remote=w.execute({type:'answer_meeting',actor:b,meetingId:1,accept:true});
  assert.equal(remote.ok,false);
  assert.equal(w.meetingLedger()[0]?.status,'offered');
});

test('the autonomous actor invites a past interlocutor, the addressee accepts, and both really meet',()=>{
  const {w,a,b,lounge}=invitationFixture();
  assert.equal(w.execute({type:'chat',actor:a,listener:b,topic:'lessons'}).ok,true);
  for(let i=0;i<67;i++)w.step(); // 19:10: first invitation, before the reply
  const records=w.meetingLedger();
  assert.equal(records.length,1);
  assert.equal(records[0]?.status,'offered');
  assert.equal(records[0]?.room,lounge);
  assert.equal(records[0]?.atMinute,2620);
  w.step();
  assert.equal(w.meetingLedger()[0]?.status,'pending');
  for(let i=68;i<=214;i++)w.step(); // next evening at 19:40
  assert.equal(w.meetingLedger()[0]?.status,'kept');
  assert.equal(w.events().filter(e=>e.type==='meeting_offered').length,1);
  assert.equal(w.events().filter(e=>e.type==='meeting_answered').length,1);
  assert.equal(w.events().filter(e=>e.type==='meeting_resolved').length,1);
});

test('the reserved addressee autonomously refuses an exploration invitation',()=>{
  const {w,a,b}=invitationFixture('reserved','explore');
  assert.equal(w.execute({type:'chat',actor:a,listener:b,topic:'castle'}).ok,true);
  for(let i=0;i<68;i++)w.step(); // invitation + the invitee's refusal
  assert.equal(w.meetingLedger().length,1);
  assert.equal(w.meetingLedger()[0]?.status,'declined');
  assert.deepEqual(w.promiseHistory(b).map(x=>x.kind),['invited','declined']);
});

test('characters with no co-presence or conversation do not invent invitations',()=>{
  const {w,b,library}=invitationFixture();
  assert.equal(w.execute({type:'move',actor:b,destination:library}).ok,true);
  w.setDailyLife(b,{
    homeRoom:library,diningRoom:library,socialRoom:library,
    style:'outgoing',interest:'lessons',socialInvitations:true
  });
  for(let i=0;i<160;i++)w.step();
  assert.equal(w.conversationHistory(b).length,0);
  assert.equal(w.meetingLedger().length,0);
});

test('unanswered invitations expire without manufacturing personal betrayal memories',()=>{
  const {w,a,b,library}=invitationFixture();
  w.setManualControl(b,true);
  w.execute({type:'offer_meeting',actor:a,listener:b,
    room:library,atMinute:2620,purpose:'study'});
  for(let i=0;i<212;i++)w.step();
  assert.equal(w.meetingLedger()[0]?.status,'unanswered');
  assert.ok(!w.promiseHistory(b).some(x=>x.kind==='waited_alone'));
});

test('invitation and consent are stable through checkpoint and journal replay',()=>{
  const {w,a,b}=invitationFixture();
  w.execute({type:'chat',actor:a,listener:b,topic:'lessons'});
  for(let i=0;i<67;i++)w.step();
  assert.equal(w.meetingLedger()[0]?.status,'offered');
  const checkpoint=restoreCheckpoint(w.checkpoint());
  const journal=restoreSimulation(w.snapshot());
  assert.deepEqual(checkpoint.captureRuntime(),w.captureRuntime());
  assert.deepEqual(journal.captureRuntime(),w.captureRuntime());
  for(let i=0;i<90;i++){w.step();checkpoint.step();journal.step();}
  assert.deepEqual(checkpoint.captureRuntime(),w.captureRuntime());
  assert.deepEqual(journal.captureRuntime(),w.captureRuntime());
});

test('autonomous school week creates locally accepted and refused meetings',()=>{
  const world=createSimulation();
  const school=createSchoolWeek(world,'adaptive','autonomous');
  for(let i=0;i<1008;i++)world.step();
  const report=reportSchoolWeek(school);
  const meetings=world.meetingLedger();
  assert.ok(meetings.length>0,'social meetings should form from actual local conversations');
  assert.ok(meetings.some(m=>m.status==='kept'),'some appointments must be kept');
  assert.ok(meetings.some(m=>m.status==='declined'),'some invitations should be refused');
  assert.equal(report.attendance.pending,0);
  assert.equal(report.attendance.on_time+report.attendance.late+report.attendance.missed,750);
  assert.ok(report.pupilMeals>0);
  assert.equal(world.events().filter(e=>e.type==='meeting_offered').length,meetings.length);
});

test('prior control experiment still runs without any auto invitations',()=>{
  const world=createSimulation();
  createSchoolWeek(world,'adaptive','off');
  for(let i=0;i<1008;i++)world.step();
  assert.equal(world.meetingLedger().length,0);
});
