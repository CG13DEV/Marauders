import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutonomousAcademicMagicSlice} from '../src/scenarios/autonomous-academic-magic.ts';

const advance=(world:{step:()=>unknown},times:number)=>{
  for(let i=0;i<times;i++)world.step();
};

test('G4.1 pupil autonomously replaces missed class with library study then practises',()=>{
  const f=createAutonomousAcademicMagicSlice();
  advance(f.world,8);
  assert.equal(f.world.attendance(f.remus)[0]?.status,'missed');
  assert.equal(f.world.spellStage(f.lily,'lumos'),'conceptual');
  assert.equal(f.world.spellStage(f.remus,'lumos'),'unaware');
  assert.deepEqual(f.world.visibleBooks(f.remus),[]); // no remote sight
  f.releaseAfterMissedLesson();
  advance(f.world,140); // includes evening library opening window
  const events=f.world.events();
  const reading=events.findIndex(e=>e.type==='book_read' && e.actor===f.remus);
  const entered=events.findIndex(e=>e.type==='entity_moved' &&
    e.actor===f.remus && e.to===f.library);
  assert.ok(entered>=0,'pupil must physically reach known library');
  assert.ok(reading>entered,'book finishes only after an observed physical journey');
  assert.equal(f.world.learningHistory(f.remus)[0]?.source.kind,'library');
  assert.equal(f.world.spellStage(f.remus,'lumos'),'independent');
  assert.ok(events.some(e=>e.type==='spell_executed'&&e.actor===f.remus&&e.mode==='guided'));
  assert.ok(events.some(e=>e.type==='spell_executed'&&e.actor===f.remus&&e.mode==='independent'));
  assert.equal(f.world.isIlluminated(f.remus),true);
});

test('no personally known library -> no magical remote book discovery',()=>{
  const f=createAutonomousAcademicMagicSlice({knowsLibrary:false});
  advance(f.world,8);
  f.releaseAfterMissedLesson();
  advance(f.world,140);
  assert.equal(f.world.spellStage(f.remus,'lumos'),'unaware');
  assert.equal(f.world.events().some(e=>e.type==='book_read'&&e.actor===f.remus),false);
});

test('an uninformative local cover cannot reveal hidden contents of book',()=>{
  const f=createAutonomousAcademicMagicSlice({bookTitle:'Трактат об основах чар'});
  advance(f.world,8);f.releaseAfterMissedLesson();
  advance(f.world,140);
  assert.ok(f.world.events().some(e=>
    e.type==='entity_moved'&&e.actor===f.remus&&e.to===f.library));
  assert.equal(f.world.events().some(e=>e.type==='book_read'&&e.actor===f.remus),false);
  assert.equal(f.world.spellStage(f.remus,'lumos'),'unaware');
});
