import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/Simulation.ts';
import { createPersistentSimulation, restoreSimulation, serializeCheckpoint } from '../src/core/persistence.ts';
import { createSchoolWeek, reportSchoolWeek } from '../src/scenarios/school-week.ts';

const travel = (w: ReturnType<typeof createSimulation>, actor: number, destination: number) => {
  const result=w.execute({type:'move',actor,destination});
  assert.equal(result.ok,true,JSON.stringify(result));
};

test('a meal is an actual local action: time, dining room and once per window', () => {
  const w=createSimulation();
  const common=w.room('common','Гостиная'), hall=w.room('hall','Коридор');
  w.connect(common,hall);
  const pupil=w.character('pupil','Ученик',common);
  w.setDailyLife(pupil,{homeRoom:common,diningRoom:hall,style:'outgoing',interest:'castle'});
  assert.deepEqual(w.execute({type:'eat_meal',actor:pupil,kind:'breakfast'}),
    {ok:false,reason:'not_at_table',events:[]});
  travel(w,pupil,hall);
  assert.equal(w.execute({type:'eat_meal',actor:pupil,kind:'breakfast'}).ok,true);
  assert.deepEqual(w.execute({type:'eat_meal',actor:pupil,kind:'breakfast'}),
    {ok:false,reason:'already_ate',events:[]});
  assert.deepEqual(w.execute({type:'eat_meal',actor:pupil,kind:'dinner'}),
    {ok:false,reason:'wrong_meal_time',events:[]});
  assert.deepEqual(w.mealHistory(pupil),[{day:0,kind:'breakfast',minute:480}]);
});

test('the same room is necessary for a conversation and creates memories for both', () => {
  const w=createSimulation();
  const common=w.room('common','Гостиная'), other=w.room('other','Класс');
  const a=w.character('a','Первый',common);
  const b=w.character('b','Второй',other);
  assert.deepEqual(w.execute({type:'chat',actor:a,listener:b,topic:'hobbies'}),
    {ok:false,reason:'not_colocated',events:[]});
  w.connect(common,other);
  travel(w,b,common);
  assert.equal(w.execute({type:'chat',actor:a,listener:b,topic:'hobbies'}).ok,true);
  assert.deepEqual(w.conversationHistory(a),[{partner:b,topic:'hobbies',minute:480}]);
  assert.deepEqual(w.conversationHistory(b),[{partner:a,topic:'hobbies',minute:480}]);
  assert.deepEqual(w.execute({type:'chat',actor:b,listener:a,topic:'castle'}),
    {ok:false,reason:'already_chatted',events:[]});
  const clone=w.conversationHistory(a);
  clone[0]!.partner=999;
  assert.equal(w.conversationHistory(a)[0]?.partner,b);
});

test('the week schedules dining travel, evenings and rest without missing lessons', () => {
  const scene=createSchoolWeek();
  const {world,students,greatHall}=scene;
  const first=students[0]!;
  assert.notEqual(world.currentRoom(first.id),greatHall);
  world.step(); // 08:10 — first corridor transition
  assert.notEqual(world.currentRoom(first.id),greatHall);
  world.step(); // 08:20 — Great Hall
  assert.equal(world.currentRoom(first.id),greatHall);
  world.step(); // 08:30 — breakfast
  assert.deepEqual(world.mealHistory(first.id)[0],{day:0,kind:'breakfast',minute:510});
  for(let i=3;i<1008;i++) world.step();
  const report=reportSchoolWeek(scene);
  assert.equal(report.attendance.missed,0);
  assert.equal(report.pupilMeals,84*3*7);
  assert.equal(report.pupilRests,84*7);
  assert.ok(report.pupilConversations>=84);
  assert.ok(world.events().some(e=>e.type==='conversation_shared'));
  assert.ok(world.events().some(e=>e.type==='rest_recorded'));
  assert.equal(world.currentRoom(first.id),scene.dorms[first.house]);
});

test('a complete daily-life checkpoint resumes with exact memories and decisions', () => {
  const persistent=createPersistentSimulation();
  const scene=createSchoolWeek(persistent);
  for(let i=0;i<81;i++) persistent.step(); // first evening and social encounters
  assert.ok(scene.students.some(s=>persistent.conversationHistory(s.id).length));
  const original=serializeCheckpoint(persistent);
  const restored=restoreSimulation(original);
  assert.deepEqual(restored.captureRuntime(),persistent.captureRuntime());
  for(let i=0;i<55;i++){restored.step();persistent.step();}
  assert.deepEqual(restored.captureRuntime(),persistent.captureRuntime());
  assert.equal(restored.mealHistory(restored.id(scene.students[0]!.key)!).length,
    persistent.mealHistory(scene.students[0]!.id).length);
});

test('separate worlds never share social history, sleep or meal records', () => {
  const a=createSimulation(), b=createSimulation();
  const aRoom=a.room('dorm','Гостиная'), bRoom=b.room('dorm','Гостиная');
  const a1=a.character('student','Ученик',aRoom), b1=b.character('student','Ученик',bRoom);
  a.setDailyLife(a1,{homeRoom:aRoom,diningRoom:aRoom,style:'outgoing',interest:'hobbies'});
  b.setDailyLife(b1,{homeRoom:bRoom,diningRoom:bRoom,style:'outgoing',interest:'hobbies'});
  a.execute({type:'eat_meal',actor:a1,kind:'breakfast'});
  assert.equal(a.mealHistory(a1).length,1);
  assert.deepEqual(b.mealHistory(b1),[]);
});
