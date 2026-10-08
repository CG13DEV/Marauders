import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/Simulation.ts';
import { createFirstRoom } from '../src/scenarios/first-room.ts';

const pattern = { spell: 'lumos' as const, intent: 'illuminate', target: 'wand_tip', incantation: 'Lumos' };
const lesson = (room: number) => ({
  id: 'lumos_class', subject: 'Чары: свет', room, startsAt: 510, endsAt: 550, spell: 'lumos' as const
});
const advance = (world: ReturnType<typeof createSimulation>, n: number) => {
  for (let i = 0; i < n; i++) world.step();
};

test('class gives the concept only during instruction, never an instant spell unlock', () => {
  const { world, lily, commonRoom } = createFirstRoom();
  world.setTimetable(lily, [lesson(commonRoom)]);
  advance(world, 3);
  assert.equal(world.spellStage(lily, 'lumos'), 'unaware');
  advance(world, 1);
  assert.equal(world.spellStage(lily, 'lumos'), 'conceptual');
  assert.equal(world.isIlluminated(lily), false);
  assert.deepEqual(world.learningHistory(lily), [{
    spell: 'lumos', stage: 'conceptual',
    source: { kind: 'lesson', lessonId: 'lumos_class', minute: 520 }
  }]);
  assert.deepEqual(world.execute({ type: 'cast_spell', actor: lily, ...pattern }),
    { ok: false, reason: 'not_practiced', events: [] });
});

test('arriving after instruction is late and misses its specific concept', () => {
  const w = createSimulation();
  const classroom = w.room('classroom', 'Класс');
  const corridor = w.room('corridor', 'Коридор');
  const remus = w.character('remus', 'Ремус', corridor);
  w.setTimetable(remus, [lesson(classroom)], 'inquiry_first');
  advance(w, 5); // 08:50, lesson was taught at 08:40
  assert.deepEqual(w.knowledgeGaps(remus), ['lumos']);
  w.connect(corridor, classroom);
  assert.equal(w.execute({ type: 'move', actor: remus, destination: classroom }).ok, true);
  advance(w, 1); // 09:00, still during class
  assert.equal(w.attendance(remus)[0]?.status, 'late');
  assert.equal(w.spellStage(remus, 'lumos'), 'unaware');
  assert.deepEqual(w.knowledgeGaps(remus), ['lumos']);
});

test('Lily can explain missed theory; Remus still cannot cast', () => {
  const w = createSimulation();
  const room = w.room('classroom', 'Класс');
  const lily = w.character('lily', 'Лили', room);
  const remus = w.character('remus', 'Ремус', room);
  w.setTimetable(lily, [lesson(room)]);
  advance(w, 4);
  assert.equal(w.spellStage(remus, 'lumos'), 'unaware');
  assert.equal(w.execute({ type: 'tutor_spell', actor: lily, listener: remus, spell: 'lumos' }).ok, true);
  assert.equal(w.spellStage(remus, 'lumos'), 'conceptual');
  assert.deepEqual(w.learningHistory(remus), [{
    spell: 'lumos', stage: 'conceptual',
    source: { kind: 'tutoring', teacher: lily, minute: 520 }
  }]);
  assert.deepEqual(w.execute({ type: 'cast_spell', actor: remus, ...pattern }),
    { ok: false, reason: 'not_practiced', events: [] });
  assert.deepEqual(w.execute({ type: 'practice_spell', actor: remus, ...pattern }),
    { ok: false, reason: 'guide_required', events: [] });
  assert.deepEqual(w.execute({ type: 'tutor_spell', actor: lily, listener: remus, spell: 'lumos' }),
    { ok: false, reason: 'already_understood', events: [] });
});

test('guided practice and later autonomous experimenting produce local light', () => {
  const w = createSimulation();
  const room = w.room('room', 'Класс');
  const teacher = w.character('teacher', 'Профессор', room);
  const james = w.character('james', 'Джеймс', room);
  w.seedSpellKnowledge(teacher, 'lumos', 'independent');
  w.setTimetable(james, [lesson(room)]);
  advance(w, 4);
  assert.deepEqual(w.execute({ type: 'cast_spell', actor: james, ...pattern }),
    { ok: false, reason: 'not_practiced', events: [] });
  assert.deepEqual(w.execute({ type: 'practice_spell', actor: james, guide: teacher,
    ...pattern, intent: 'freeze' }),
    { ok: false, reason: 'pattern_mismatch', events: [] });
  assert.equal(w.isIlluminated(james), false);
  assert.equal(w.execute({ type: 'practice_spell', actor: james, guide: teacher, ...pattern }).ok, true);
  assert.equal(w.spellStage(james, 'lumos'), 'guided');
  assert.equal(w.isIlluminated(james), true);
  w.setExperimenter(james, true);
  assert.deepEqual(w.step(), []); // at 08:50, he is still in the lesson
  advance(w, 3); // after the lesson, he experiments without assistance
  assert.equal(w.spellStage(james, 'lumos'), 'independent');
  assert.equal(w.execute({ type: 'cast_spell', actor: james, ...pattern }).ok, true);
  assert.deepEqual(w.learningHistory(james).map(x => x.stage),
    ['conceptual', 'guided', 'independent']);
  assert.equal(w.events().filter(e => e.type === 'spell_executed').length, 3);
});

test('a guide must be qualified and physically present', () => {
  const w = createSimulation();
  const room = w.room('room', 'Класс');
  const outside = w.room('outside', 'Коридор');
  const learner = w.character('learner', 'Ученик', room);
  const peer = w.character('peer', 'Друг', room);
  const remote = w.character('remote', 'Преподаватель', outside);
  w.seedSpellKnowledge(learner, 'lumos', 'conceptual');
  w.seedSpellKnowledge(peer, 'lumos', 'conceptual');
  w.seedSpellKnowledge(remote, 'lumos', 'independent');
  assert.deepEqual(w.execute({ type: 'practice_spell', actor: learner, guide: peer, ...pattern }),
    { ok: false, reason: 'guide_unqualified', events: [] });
  assert.deepEqual(w.execute({ type: 'practice_spell', actor: learner, guide: remote, ...pattern }),
    { ok: false, reason: 'invalid_guide', events: [] });
  assert.equal(w.isIlluminated(learner), false);
});

test('knowledge cannot be invented by conversation or casting', () => {
  const w = createSimulation();
  const room = w.room('room', 'Класс');
  const lily = w.character('lily', 'Лили', room);
  const remus = w.character('remus', 'Ремус', room);
  assert.deepEqual(w.execute({ type: 'tutor_spell', actor: lily, listener: remus, spell: 'lumos' }),
    { ok: false, reason: 'not_understood', events: [] });
  assert.deepEqual(w.execute({ type: 'practice_spell', actor: lily, ...pattern }),
    { ok: false, reason: 'not_understood', events: [] });
  assert.deepEqual(w.execute({ type: 'cast_spell', actor: lily, ...pattern }),
    { ok: false, reason: 'not_understood', events: [] });
});

test('missing a class leaves a concrete knowledge gap, recovered by meeting a peer', () => {
  const w = createSimulation();
  const classroom = w.room('classroom', 'Класс');
  const outside = w.room('outside', 'Недоступная комната');
  const remus = w.character('remus', 'Ремус', outside);
  const lily = w.character('lily', 'Лили', classroom);
  w.setTimetable(remus, [lesson(classroom)]);
  w.setTimetable(lily, [lesson(classroom)]);
  advance(w, 8);
  assert.equal(w.attendance(remus)[0]?.status, 'missed');
  assert.equal(w.learningDebt(remus), 1);
  assert.deepEqual(w.knowledgeGaps(remus), ['lumos']);
  assert.equal(w.spellStage(lily, 'lumos'), 'conceptual');
  assert.deepEqual(w.execute({ type: 'tutor_spell', actor: lily, listener: remus, spell: 'lumos' }),
    { ok: false, reason: 'not_colocated', events: [] });
  w.connect(classroom, outside);
  w.execute({ type: 'move', actor: remus, destination: classroom });
  assert.equal(w.execute({ type: 'tutor_spell', actor: lily, listener: remus, spell: 'lumos' }).ok, true);
  assert.deepEqual(w.knowledgeGaps(remus), []);
  assert.equal(w.learningDebt(remus), 1); // actual absence is not rewritten
});

test('knowledge sources are defensive copies and separate simulation worlds do not leak', () => {
  const a = createSimulation(), b = createSimulation();
  const room = a.room('room', 'Класс'), otherRoom = b.room('room', 'Класс');
  const teacher = a.character('teacher', 'Учитель', room);
  const pupil = a.character('pupil', 'Ученик', room);
  const other = b.character('pupil', 'Ученик', otherRoom);
  a.seedSpellKnowledge(teacher, 'lumos', 'independent');
  a.execute({ type: 'tutor_spell', actor: teacher, listener: pupil, spell: 'lumos' });
  const records = a.learningHistory(pupil);
  records[0]!.stage = 'independent';
  if (records[0]?.source.kind === 'tutoring') records[0].source.teacher = 9999;
  assert.equal(a.spellStage(pupil, 'lumos'), 'conceptual');
  assert.equal(b.spellStage(other, 'lumos'), 'unaware');
  assert.deepEqual(a.execute({ type: 'tutor_spell', actor: room, listener: pupil, spell: 'lumos' }),
    { ok: false, reason: 'not_character', events: [] });
});
