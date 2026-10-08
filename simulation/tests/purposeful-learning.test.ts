import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersistentSimulation, restoreCheckpoint, restoreSimulation } from '../src/core/persistence.ts';
import { createSchoolWeek, reportSchoolWeek } from '../src/scenarios/school-week.ts';
import { createSimulation } from '../src/core/Simulation.ts';

function lessonNeed(options: {qualified?: boolean; alternative?: boolean} = {}) {
  const w=createPersistentSimulation();
  const common=w.room('common','Гостиная');
  const library=w.room('library','Библиотека');
  const classroom=w.room('classroom','Кабинет чар');
  w.connect(common,library);w.connect(common,classroom);
  const learner=w.character('pupil','Первокурсник',common);
  const helper=w.character('helper','Старшекурсник',common);
  const alternative=options.alternative ? w.character('alternate','Друг',common):null;
  w.setDailyLife(learner,{homeRoom:common,diningRoom:common,
    socialRoom:common,leisureRoom:library,style:'reserved',interest:'lessons',
    socialInvitations:true,learningAppointments:true});
  w.setDailyLife(helper,{homeRoom:common,diningRoom:common,
    socialRoom:common,style:'reserved',interest:'lessons',socialInvitations:true});
  w.setHelpful(helper,true);
  if(options.qualified!==false)w.seedSpellKnowledge(helper,'lumos','conceptual');
  if(alternative!==null){
    w.setDailyLife(alternative,{homeRoom:common,diningRoom:common,
      socialRoom:common,style:'reserved',interest:'lessons',socialInvitations:true});
    w.setHelpful(alternative,true);
    w.seedSpellKnowledge(alternative,'lumos','conceptual');
  }
  w.setTimetable(learner,[{id:'charms',subject:'Чары',room:classroom,
    startsAt:520,endsAt:570,spell:'lumos'}]);
  w.setHelpSeeking(learner,true);
  w.setManualControl(learner,true);
  for(let i=0;i<10;i++)w.step();
  w.setManualControl(learner,false);
  assert.equal(w.attendance(learner)[0]?.status,'missed');
  assert.deepEqual(w.knowledgeGaps(learner),['lumos']);
  return {w,learner,helper,alternative,common,library};
}

test('genuine missing knowledge produces an invited, still unlearned study purpose',()=>{
  const {w,learner,helper,library}=lessonNeed();
  for(let i=10;i<67;i++)w.step();
  const m=w.meetingLedger()[0]!;
  assert.equal(m.status,'offered');
  assert.equal(m.promisor,learner);
  assert.equal(m.beneficiary,helper);
  assert.equal(m.room,library);
  assert.equal(m.purpose,'study');
  assert.equal(m.spell,'lumos');
  assert.equal(w.promiseHistory(learner).at(-1)?.spell,'lumos');
  assert.equal(w.spellStage(learner,'lumos'),'unaware');
});

test('accepted study appointment leads to actual tutoring, not an automatic meeting reward',()=>{
  const {w,learner,helper,library}=lessonNeed();
  for(let i=10;i<215;i++)w.step();
  assert.equal(w.meetingLedger()[0]?.status,'kept');
  assert.equal(w.meetingLedger()[0]?.taught,true);
  const taught=w.events().find(x=>x.type==='tutoring_appointment_completed');
  assert.equal(taught?.room,library);
  assert.equal(taught?.minute,2620);
  assert.equal(w.spellStage(learner,'lumos'),'conceptual');
  assert.deepEqual(w.learningHistory(learner)[0]?.source,
    {kind:'tutoring',teacher:helper,minute:2620});
  assert.deepEqual(w.assistance(learner).map(x=>x.helper),[helper]);
  assert.equal(w.events().filter(x=>x.type==='tutoring_appointment_completed').length,1);
  assert.equal(w.execute({type:'tutor_appointment',actor:helper,meetingId:1}).ok,false);
});

test('an unqualified helper refuses; a learner may choose a second local candidate',()=>{
  const {w,learner,helper,alternative}=lessonNeed({qualified:false,alternative:true});
  for(let i=10;i<75;i++)w.step();
  const meetings=w.meetingLedger();
  assert.ok(meetings.some(x=>x.beneficiary===helper && x.status==='declined'));
  assert.ok(meetings.some(x=>x.beneficiary===alternative && x.status==='pending'));
  assert.equal(w.spellStage(learner,'lumos'),'unaware');
  for(let i=75;i<215;i++)w.step();
  assert.equal(w.spellStage(learner,'lumos'),'conceptual');
  assert.equal(w.assistance(learner)[0]?.helper,alternative);
});

test('an appointment may be kept without teaching if the helper does not act',()=>{
  const {w,learner,helper,library}=lessonNeed();
  for(let i=10;i<74;i++)w.step();
  w.setManualControl(helper,true);
  for(let i=74;i<213;i++)w.step();
  assert.equal(w.execute({type:'move',actor:helper,destination:library}).ok,true);
  for(let i=213;i<215;i++)w.step();
  assert.equal(w.meetingLedger()[0]?.status,'kept');
  assert.notEqual(w.meetingLedger()[0]?.taught,true);
  assert.equal(w.spellStage(learner,'lumos'),'unaware');
  assert.deepEqual(w.assistance(learner),[]);
});

test('teaching without accepted appointment, correct helper, place or time fails closed',()=>{
  const {w,learner,helper,library}=lessonNeed();
  for(let i=10;i<68;i++)w.step();
  assert.equal(w.meetingLedger()[0]?.status,'pending');
  assert.equal(w.execute({type:'tutor_appointment',actor:learner,meetingId:1}).ok,false);
  assert.equal(w.execute({type:'tutor_appointment',actor:helper,meetingId:1}).ok,false);
  w.execute({type:'move',actor:helper,destination:library});
  assert.equal(w.execute({type:'tutor_appointment',actor:helper,meetingId:1}).ok,false);
  assert.equal(w.spellStage(learner,'lumos'),'unaware');
});

test('a learner with existing knowledge cannot offer a fake tutoring need',()=>{
  const w=createSimulation(),r=w.room('r','Гостиная');
  const a=w.character('a','А',r),b=w.character('b','Б',r);
  w.seedSpellKnowledge(a,'lumos','conceptual');
  assert.equal(w.execute({type:'offer_meeting',actor:a,listener:b,
    room:r,atMinute:2620,purpose:'study',spell:'lumos'}).ok,false);
  assert.equal(w.execute({type:'offer_meeting',actor:b,listener:a,
    room:r,atMinute:2620,purpose:'explore',spell:'lumos'}).ok,false);
});

test('V1 replay and V2 checkpoint reproduce tutoring after future appointment',()=>{
  const {w}=lessonNeed();
  for(let i=10;i<71;i++)w.step();
  const j=restoreSimulation(w.snapshot()),c=restoreCheckpoint(w.checkpoint());
  assert.deepEqual(j.captureRuntime(),w.captureRuntime());
  assert.deepEqual(c.captureRuntime(),w.captureRuntime());
  for(let i=71;i<215;i++){w.step();j.step();c.step();}
  assert.deepEqual(j.captureRuntime(),w.captureRuntime());
  assert.deepEqual(c.captureRuntime(),w.captureRuntime());
  assert.equal(c.spellStage(c.id('pupil')!,'lumos'),'conceptual');
});

test('existing generated school week remains unchanged when special learning goals are off',()=>{
  const w=createSimulation(),school=createSchoolWeek(w);
  for(let i=0;i<1008;i++)w.step();
  const r=reportSchoolWeek(school);
  assert.equal(r.invitations,56);
  assert.equal(r.fulfilledMeetings,44);
  assert.equal(r.firstYearKnowsLumos,12);
  assert.equal(r.attendance.on_time,684);
  assert.equal(r.attendance.late,66);
});
