import test from 'node:test';
import assert from 'node:assert/strict';
import { createAcademicMagicSlice } from '../src/scenarios/academic-magic.ts';
import { createPersistentSimulation, restoreCheckpoint, restoreSimulation,
  serializeCheckpoint, serializeSimulation } from '../src/core/persistence.ts';

const pattern = {spell:'lumos' as const,intent:'illuminate',target:'wand_tip',incantation:'Lumos'};
const advance = (world: {step:()=>unknown},steps:number) => {
  for(let i=0;i<steps;i++) world.step();
};

test('class teaches one pupil; the absentee can later read a physical book for the same concept',()=>{
  const {world,lily,remus,textbook,professor,corridor,library} = createAcademicMagicSlice();
  assert.deepEqual(world.visibleBooks(lily),[]);
  assert.deepEqual(world.visibleBooks(remus),[{id:textbook,label:'Основы освещающих чар (учебный экземпляр)'}]);
  advance(world,8); // 09:20, attendance is recorded; no global knowledge unlock
  assert.equal(world.spellStage(lily,'lumos'),'conceptual');
  assert.equal(world.attendance(remus)[0]?.status,'missed');
  assert.deepEqual(world.knowledgeGaps(remus),['lumos']);
  assert.equal(world.spellStage(remus,'lumos'),'unaware');
  const begun=world.execute({type:'study_book',actor:remus,book:textbook});
  assert.equal(begun.ok,true);
  assert.equal(world.spellStage(remus,'lumos'),'unaware');
  advance(world,1);
  assert.equal(world.spellStage(remus,'lumos'),'unaware');
  advance(world,1); // 09:40
  assert.equal(world.spellStage(remus,'lumos'),'conceptual');
  assert.deepEqual(world.learningHistory(remus)[0]?.source,
    {kind:'library',book:textbook,minute:580});
  assert.deepEqual(world.knowledgeGaps(remus),[]);
  assert.equal(world.isIlluminated(remus),false); // reading is not spellcasting
  assert.deepEqual(world.execute({type:'cast_spell',actor:remus,...pattern}),
    {ok:false,reason:'not_practiced',events:[]});
  assert.equal(world.execute({type:'move',actor:professor,destination:corridor}).ok,true);
  assert.equal(world.execute({type:'move',actor:professor,destination:library}).ok,true);
  assert.equal(world.execute({type:'practice_spell',actor:remus,guide:professor,...pattern}).ok,true);
  assert.equal(world.spellStage(remus,'lumos'),'guided');
  assert.equal(world.execute({type:'practice_spell',actor:remus,...pattern}).ok,true);
  assert.equal(world.execute({type:'cast_spell',actor:remus,...pattern}).ok,true);
});

test('reading requires eyesight, real book co-location and free academic time',()=>{
  const {world,lily,remus,textbook,library} = createAcademicMagicSlice();
  assert.deepEqual(world.execute({type:'study_book',actor:lily,book:textbook}),
    {ok:false,reason:'book_not_in_reach',events:[]});
  assert.deepEqual(world.execute({type:'study_book',actor:remus,book:123456}),
    {ok:false,reason:'unknown_book',events:[]});
  const blind = world.character('blind','Без зрения',library,{vision:false});
  assert.deepEqual(world.visibleBooks(blind),[]);
  assert.deepEqual(world.execute({type:'study_book',actor:blind,book:textbook}),
    {ok:false,reason:'cannot_read',events:[]});
  advance(world,4); // 08:40 school lesson underway
  assert.deepEqual(world.execute({type:'study_book',actor:remus,book:textbook}),
    {ok:false,reason:'busy_at_lesson',events:[]});
});

test('moving away cancels reading without granting the concept',()=>{
  const {world,remus,textbook,corridor} = createAcademicMagicSlice();
  assert.equal(world.execute({type:'study_book',actor:remus,book:textbook}).ok,true);
  const result=world.execute({type:'move',actor:remus,destination:corridor});
  assert.equal(result.ok,true);
  assert.equal(result.events[0]?.type,'book_reading_interrupted');
  advance(world,3);
  assert.equal(world.spellStage(remus,'lumos'),'unaware');
  assert.equal(world.readingOf(remus),null);
});

test('persistent checkpoint and replay survive an unfinished book reading',()=>{
  const w=createPersistentSimulation();
  const classroom=w.room('charms','Класс');
  const library=w.room('library','Библиотека',{floor:2,kind:'library'});
  w.connect(classroom,library);
  const reader=w.character('reader','Ученик',library);
  const book=w.spellBook('primer','Книга чар',library,'lumos');
  w.setManualControl(reader,true);
  assert.equal(w.execute({type:'study_book',actor:reader,book}).ok,true);
  w.step(); // 10 of 20 minutes elapsed
  const checkpoint=restoreCheckpoint(serializeCheckpoint(w));
  const restoredReader=checkpoint.id('reader')!,restoredBook=checkpoint.id('primer')!;
  assert.deepEqual(checkpoint.readingOf(restoredReader),
    {book:restoredBook,startedAt:480});
  checkpoint.step();
  assert.equal(checkpoint.spellStage(restoredReader,'lumos'),'conceptual');
  assert.deepEqual(checkpoint.learningHistory(restoredReader)[0]?.source,
    {kind:'library',book:restoredBook,minute:500});

  const replay=restoreSimulation(serializeSimulation(w));
  const replayReader=replay.id('reader')!;
  assert.equal(replay.spellStage(replayReader,'lumos'),'unaware');
  replay.step();
  assert.equal(replay.spellStage(replayReader,'lumos'),'conceptual');
});
