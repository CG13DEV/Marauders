import test from 'node:test';
import assert from 'node:assert/strict';
import {createPersistentSimulation,restoreCheckpoint,restoreSimulation}
  from '../src/core/persistence.ts';
import {nextWitnessInquiry} from '../src/core/resident-life.ts';

test('witness choice uses only known damage and co-located people, once each',()=>{
  assert.deepEqual(nextWitnessInquiry([9,3,9],[8,5,8],[]),
    {object:3,listener:5,key:'3:5'});
  assert.deepEqual(nextWitnessInquiry([9,3],[8,5],['3:5','3:8']),
    {object:9,listener:5,key:'9:5'});
  assert.equal(nextWitnessInquiry([3],[5],['3:5']),null);
  assert.equal(nextWitnessInquiry([], [5], []),null);
});

test('after examining damage, anyone can question a local witness without knowing a culprit',()=>{
  const w=createPersistentSimulation();
  const office=w.room('office','Кабинет');
  const hall=w.room('hall','Коридор');
  w.connect(office,hall);
  const seeker=w.character('seeker','Свидетель последствий',office);
  const witness=w.character('witness','Очевидец',hall);
  const pupil=w.character('pupil','Ученик',hall);
  const cup=w.fragileObject('cup','Чашка',hall);
  assert.equal(w.execute({type:'break_object',actor:pupil,target:cup}).ok,true);
  assert.equal(w.beliefs(seeker).length,0);
  assert.equal(w.execute({type:'move',actor:seeker,destination:hall}).ok,true);
  assert.deepEqual(w.execute({type:'ask_about',actor:seeker,listener:witness,
    object:cup}),{ok:false,reason:'not_known',events:[]});
  assert.equal(w.execute({type:'inspect_object',actor:seeker,target:cup}).ok,true);
  assert.equal(w.beliefs(seeker).length,0,'damage does not identify culprit');
  const question=w.execute({type:'ask_about',actor:seeker,listener:witness,object:cup});
  assert.equal(question.ok,true);
  assert.equal(question.events.some(e=>e.type==='question_asked'&&e.answered),true);
  assert.equal(w.beliefs(seeker)[0]?.claim.culprit,pupil);
  assert.equal(w.beliefs(seeker)[0]?.evidence.kind,'testimony');
  if(w.beliefs(seeker)[0]?.evidence.kind==='testimony')
    assert.deepEqual(w.beliefs(seeker)[0]?.evidence.origin,{kind:'vision'});
});

test('an animal cannot answer even when it personally witnessed wrongdoing',()=>{
  const w=createPersistentSimulation();
  const hall=w.room('hall','Коридор');
  const seeker=w.character('seeker','Филч',hall);
  const cat=w.character('cat','Норрис',hall);
  const pupil=w.character('pupil','Ученик',hall);
  const cup=w.fragileObject('cup','Чашка',hall);
  w.configurePatrol(seeker,'caretaker',[hall]);
  w.configurePatrol(cat,'animal',[hall],seeker,hall);
  w.execute({type:'break_object',actor:pupil,target:cup});
  assert.equal(w.execute({type:'inspect_object',actor:seeker,target:cup}).ok,true);
  assert.deepEqual(w.execute({type:'ask_about',actor:seeker,listener:cat,
    object:cup}),{ok:false,reason:'listener_cannot_speak',events:[]});
});

test('Filch learns via an actual eyewitness, reports provenance to a teacher, but never assigns points',()=>{
  const w=createPersistentSimulation();
  const office=w.room('office','Кабинет');
  const vestibule=w.room('vestibule','Промежуточный коридор');
  const hall=w.room('hall','Коридор');
  w.connect(office,vestibule);
  w.connect(vestibule,hall);
  const filch=w.character('filch','Филч',office);
  const cat=w.character('cat','Миссис Норрис',hall);
  const culprit=w.character('culprit','Нарушитель',hall);
  const witness=w.character('witness','Очевидец',hall);
  const teacher=w.character('teacher','Профессор',office);
  const vase=w.fragileObject('vase','Ваза',hall);
  w.registerHouse(culprit,'slytherin');
  w.grantPointAuthority(teacher,'teacher');
  w.setGuarded(culprit,true);
  w.configurePatrol(filch,'caretaker',[office]);
  w.configurePatrol(cat,'animal',[hall,office],filch,office);
  assert.equal(w.execute({type:'break_object',actor:culprit,target:vase}).ok,true);
  assert.equal(w.beliefs(filch).length,0);
  assert.equal(w.beliefs(teacher).length,0);
  for(let i=0;i<20 && w.beliefs(filch).length===0;i++) w.step();
  const questions=w.events().filter(e=>e.type==='question_asked'&&e.actor===filch);
  assert.ok(questions.some(e=>e.type==='question_asked'&&
    e.listener===culprit&&!e.answered),'guarded culprit remains silent');
  assert.ok(questions.some(e=>e.type==='question_asked'&&
    e.listener===witness&&e.answered),'eyewitness answers locally');
  const filchBelief=w.beliefs(filch)[0]!;
  assert.deepEqual(filchBelief.claim,{kind:'broke_object',object:vase,culprit});
  assert.equal(filchBelief.evidence.kind,'testimony');
  if(filchBelief.evidence.kind==='testimony')
    assert.deepEqual({speaker:filchBelief.evidence.speaker,
      origin:filchBelief.evidence.origin},
      {speaker:witness,origin:{kind:'vision'}});
  assert.equal(w.beliefs(teacher).length,0,'testimony does not teleport');
  const checkpoint=restoreCheckpoint(w.checkpoint());
  const journal=restoreSimulation(w.snapshot());
  assert.deepEqual(checkpoint.captureRuntime(),w.captureRuntime());
  assert.deepEqual(journal.captureRuntime(),w.captureRuntime());
  for(let i=0;i<18;i++){w.step();checkpoint.step();journal.step();}
  assert.deepEqual(checkpoint.captureRuntime(),w.captureRuntime());
  assert.deepEqual(journal.captureRuntime(),w.captureRuntime());
  const teacherBelief=w.beliefs(teacher)[0]!;
  assert.deepEqual(teacherBelief.claim,filchBelief.claim);
  assert.equal(teacherBelief.evidence.kind,'testimony');
  if(teacherBelief.evidence.kind==='testimony')
    assert.deepEqual({speaker:teacherBelief.evidence.speaker,
      origin:teacherBelief.evidence.origin},
      {speaker:filch,origin:{kind:'testimony',speaker:witness}});
  assert.equal(w.housePoints().slytherin,0,'only staff can separately decide');
  assert.equal(w.events().filter(e=>e.type==='testimony_delivered'&&
    e.actor===filch&&e.listener===teacher).length,1,'no duplicate reporting');
  assert.equal(w.events().filter(e=>e.type==='animal_alerted').length,1);
});
