import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/Simulation.ts';
import { createPersistentSimulation, restoreCheckpoint, restoreSimulation } from '../src/core/persistence.ts';
import { createSchoolWeek, reportSchoolWeek } from '../src/scenarios/school-week.ts';

function grounds() {
  const w=createPersistentSimulation();
  const home=w.room('home','Гостиная');
  const hall=w.room('hall','Переход');
  const library=w.room('library','Библиотека');
  const study=w.room('study','Кабинет');
  w.connect(home,hall);w.connect(hall,library);w.connect(hall,study);
  const learner=w.character('learner','Первокурсник',home);
  const helper=w.character('helper','Старшекурсник',home);
  const daily={
    homeRoom:home,diningRoom:home,socialRoom:home,
    style:'reserved' as const,interest:'lessons' as const,
    intentionPlanning:true,socialInvitations:true
  };
  w.setDailyLife(learner,{...daily,learningAppointments:true,leisureRoom:library});
  w.setDailyLife(helper,daily);
  w.setHelpSeeking(learner,true);
  w.setHelpful(helper,true);
  w.seedSpellKnowledge(helper,'lumos','conceptual');
  return {w,home,hall,library,study,learner,helper};
}

test('a knowledge gap creates a persistent goal and later a real appointment and real learning',()=>{
  const {w,learner,helper,home,library,study}=grounds();
  w.setTimetable(learner,[{
    id:'charms',subject:'Чары',room:study,
    startsAt:520,endsAt:570,spell:'lumos'
  }]);
  w.setManualControl(learner,true);
  for(let i=0;i<10;i++)w.step();
  w.setManualControl(learner,false);
  assert.equal(w.attendance(learner)[0]?.status,'missed');
  w.step();
  assert.equal(w.intentionHistory(learner).filter(g=>g.kind==='learn_concept').length,1);
  for(let i=11;i<68;i++)w.step();
  const invitation=w.meetingLedger()[0];
  assert.equal(invitation?.spell,'lumos');
  assert.equal(invitation?.status,'pending');
  assert.equal(w.intentionHistory(learner).filter(g=>g.kind==='attend_meeting').length,1);
  assert.equal(w.intentionHistory(helper).filter(g=>g.kind==='attend_meeting').length,1);
  for(let i=68;i<216;i++)w.step();
  assert.equal(w.meetingLedger()[0]?.status,'kept');
  assert.equal(w.meetingLedger()[0]?.taught,true);
  assert.equal(w.spellStage(learner,'lumos'),'conceptual');
  assert.equal(w.intentionHistory(learner).find(g=>g.kind==='learn_concept')?.status,'completed');
  assert.equal(w.intentionHistory(learner).find(g=>g.kind==='attend_meeting')?.status,'completed');
  assert.equal(w.intentionHistory(helper).find(g=>g.kind==='attend_meeting')?.status,'completed');
  assert.equal(w.assistance(learner)[0]?.helper,helper);
});

test('not knowing the spell is an observable refusal, not an invented successful study goal',()=>{
  const {w,learner,helper,study}=grounds();
  w.setTimetable(learner,[{
    id:'charms',subject:'Чары',room:study,
    startsAt:520,endsAt:570,spell:'lumos'
  }]);
  // Second helper lacks Lumos. The learner must not peek into that fact.
  w.setHelpful(helper,false);
  w.setManualControl(learner,true);
  for(let i=0;i<10;i++)w.step();
  w.setManualControl(learner,false);
  for(let i=10;i<75;i++)w.step();
  assert.equal(w.meetingLedger()[0]?.status,'declined');
  assert.equal(w.spellStage(learner,'lumos'),'unaware');
  assert.ok(w.intentionHistory(learner).some(g=>g.kind==='learn_concept'&&
    g.status!=='completed'));
  assert.ok(!w.intentionHistory(learner).some(g=>g.kind==='attend_meeting'));
});

test('a socially accepted meeting becomes two real personal goals; neither teleports',()=>{
  const {w,learner,helper,home,study}=grounds();
  assert.equal(w.execute({type:'offer_meeting',actor:learner,
    listener:helper,room:study,atMinute:2620,purpose:'explore'}).ok,true);
  assert.equal(w.intentionHistory(learner).length,0);
  assert.equal(w.execute({type:'answer_meeting',actor:helper,
    meetingId:1,accept:true}).ok,true);
  for(const actor of [learner,helper]){
    const goals=w.intentionHistory(actor);
    assert.equal(goals[0]?.kind,'attend_meeting');
    assert.equal(goals[0]?.destination,study);
  }
  for(let i=0;i<215;i++)w.step();
  assert.equal(w.meetingLedger()[0]?.status,'kept');
  assert.equal(w.intentionHistory(learner)[0]?.status,'completed');
  assert.equal(w.intentionHistory(helper)[0]?.status,'completed');
  assert.equal(w.events().filter(e=>e.type==='entity_moved'&&e.to===study).length,2);
});

test('an unilateral promise does not compel a listener to adopt an intention',()=>{
  const {w,learner,helper,study}=grounds();
  const result=w.execute({type:'promise_meeting',actor:learner,
    listener:helper,room:study,atMinute:2620,purpose:'explore'});
  assert.equal(result.ok,true);
  assert.equal(w.intentionHistory(learner)[0]?.kind,'attend_meeting');
  assert.equal(w.intentionHistory(helper).length,0);
});

test('investigation resumes by remembered location, never by omniscient object tracking',()=>{
  const {w,learner,home,library}=grounds();
  const cup=w.fragileObject('cup','Чашка',home);
  const witness=w.character('witness','Очевидец',home);
  w.execute({type:'tell',actor:witness,listener:learner,
    claim:{kind:'broke_object',culprit:witness,object:cup}});
  assert.equal(w.execute({type:'intend_investigate',actor:learner,object:cup}).ok,true);
  assert.equal(w.execute({type:'move',actor:learner,destination:w.id('hall')!}).ok,true);
  w.step(); // Hunger/meal may interrupt; the goal survives.
  for(let i=0;i<7;i++)w.step();
  assert.equal(w.currentRoom(learner),home);
  assert.equal(w.intentionHistory(learner).find(g=>g.kind==='investigate')?.status,'completed');
  assert.equal(w.observations(learner).filter(x=>x.kind==='inspected_object').length,1);
});

test('rejected invitation makes no obligation and cannot create meeting goals',()=>{
  const {w,learner,helper,study}=grounds();
  w.execute({type:'offer_meeting',actor:learner,listener:helper,
    room:study,atMinute:2620,purpose:'explore'});
  w.execute({type:'answer_meeting',actor:helper,meetingId:1,accept:false});
  assert.deepEqual(w.intentionHistory(helper),[]);
  assert.deepEqual(w.intentionHistory(learner),[]);
});

test('investigation needs locally heard evidence and is completed only by physical inspection',()=>{
  const {w,learner,home}=grounds();
  const cup=w.fragileObject('cup','Чашка',home);
  const absent=w.fragileObject('absent','Далёкий кубок',w.id('study')!);
  const culprit=w.character('culprit','Подозреваемый',home);
  const witness=w.character('witness','Свидетель',home);
  assert.equal(w.execute({type:'intend_investigate',actor:learner,object:cup}).ok,false);
  assert.equal(w.execute({type:'tell',actor:witness,listener:learner,
    claim:{kind:'broke_object',culprit,object:cup}}).ok,true);
  assert.equal(w.execute({type:'intend_investigate',actor:learner,object:absent}).ok,false);
  assert.equal(w.execute({type:'intend_investigate',actor:learner,object:cup}).ok,true);
  assert.equal(w.observations(learner).some(x=>x.kind==='inspected_object'),false);
  for(let i=0;i<3;i++)w.step();
  assert.equal(w.intentionHistory(learner).find(g=>g.kind==='investigate')?.status,'completed');
  assert.equal(w.observations(learner).filter(x=>x.kind==='inspected_object').length,1);
});

test('a contested local report spontaneously forms an investigation goal for opt-in NPC',()=>{
  const {w,learner,home}=grounds();
  const cup=w.fragileObject('cup','Чашка',home);
  const a=w.character('a','Свидетель А',home);
  const b=w.character('b','Свидетель Б',home);
  w.setInquisitive(learner,true);
  assert.equal(w.execute({type:'tell',actor:a,listener:learner,
    claim:{kind:'broke_object',culprit:a,object:cup}}).ok,true);
  assert.equal(w.execute({type:'tell',actor:b,listener:learner,
    claim:{kind:'broke_object',culprit:b,object:cup}}).ok,true);
  for(let i=0;i<3;i++)w.step();
  assert.ok(w.intentionHistory(learner).some(g=>g.kind==='investigate'));
  assert.equal(w.observations(learner).filter(o=>o.kind==='inspected_object').length,1);
});

test('restored journal and checkpoint preserve all intention kinds and remap object references',()=>{
  const {w,learner,helper,home,study}=grounds();
  const cup=w.fragileObject('cup','Чашка',home);
  const witness=w.character('witness','Свидетель',home);
  w.execute({type:'tell',actor:witness,listener:learner,
    claim:{kind:'broke_object',culprit:witness,object:cup}});
  w.execute({type:'intend_investigate',actor:learner,object:cup});
  w.execute({type:'offer_meeting',actor:learner,listener:helper,
    room:study,atMinute:2620,purpose:'explore'});
  w.execute({type:'answer_meeting',actor:helper,meetingId:1,accept:true});
  const journal=restoreSimulation(w.snapshot()),checkpoint=restoreCheckpoint(w.checkpoint());
  assert.deepEqual(journal.captureRuntime(),w.captureRuntime());
  assert.deepEqual(checkpoint.captureRuntime(),w.captureRuntime());
  for(let i=0;i<215;i++){w.step();journal.step();checkpoint.step();}
  assert.deepEqual(journal.captureRuntime(),w.captureRuntime());
  assert.deepEqual(checkpoint.captureRuntime(),w.captureRuntime());
  assert.equal(w.intentionHistory(learner).find(g=>g.kind==='investigate')?.status,'completed');
  assert.equal(w.intentionHistory(learner).find(g=>g.kind==='attend_meeting')?.status,'completed');
});

test('control school still retains experiment 18 population metrics',()=>{
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
