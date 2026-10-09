import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/Simulation.ts';
import { willingToTutor } from '../src/core/social-learning.ts';

function missedLessonAndMeeting() {
  const world = createSimulation();
  const classroom = world.room('classroom', 'Класс чар');
  const corridor = world.room('corridor', 'Коридор');
  const library = world.room('library', 'Библиотека');
  world.connect(classroom, library);
  const lily = world.character('lily', 'Лили Эванс', classroom);
  const remus = world.character('remus', 'Ремус Люпин', corridor);
  const lesson = {
    id: 'lumos-lesson', subject: 'Чары', room: classroom,
    startsAt: 510, endsAt: 550, spell: 'lumos' as const
  };
  world.setTimetable(lily, [lesson]);
  world.setTimetable(remus, [lesson]);
  world.setHelpSeeking(remus, true);
  world.setHelpful(lily, true);
  world.setTrust(remus, lily, 'trusted');
  world.setTrust(lily, remus, 'trusted');
  for (let i = 0; i < 8; i++) world.step(); // 09:20: missed lesson complete
  assert.equal(world.attendance(remus)[0]?.status, 'missed');
  assert.equal(world.spellStage(lily, 'lumos'), 'conceptual');
  assert.deepEqual(world.knowledgeGaps(remus), ['lumos']);
  world.connect(classroom, corridor);
  world.setRoutine(remus, [classroom]);
  return { world, classroom, corridor, library, remus, lily };
}

test('Remus asks for help on meeting Lily, who voluntarily teaches on the next tick', () => {
  const { world, remus, lily, classroom } = missedLessonAndMeeting();
  assert.deepEqual(world.step().map(d => d.action), [
    { type: 'move', actor: remus, destination: classroom }
  ]);
  const requestStep = world.step();
  assert.deepEqual(requestStep.map(d => d.action), [
    { type: 'ask_tutoring', actor: remus, listener: lily, spell: 'lumos' }
  ]);
  assert.equal(world.spellStage(remus, 'lumos'), 'unaware');
  assert.deepEqual(world.tutoringRequest(remus), {
    requester: remus, helper: lily, spell: 'lumos', minute: 580
  });
  assert.deepEqual(world.step().map(d => d.action), [
    { type: 'answer_tutoring', actor: lily, requester: remus, spell: 'lumos', accept: true }
  ]);
  assert.equal(world.spellStage(remus, 'lumos'), 'conceptual');
  assert.equal(world.isIlluminated(remus), false);
  assert.equal(world.learningDebt(remus), 1); // history of absence is preserved
  assert.deepEqual(world.knowledgeGaps(remus), []);
  assert.deepEqual(world.assistance(remus), [{ helper: lily, spell: 'lumos', minute: 590 }]);
  assert.equal(world.hasHelped(lily, remus), true);
  assert.equal(world.hasHelped(remus, lily), false);
  assert.equal(world.trustOf(remus, lily), 'trusted');
  assert.deepEqual(world.execute({ type: 'cast_spell', actor: remus,
    spell: 'lumos', intent: 'illuminate', target: 'wand_tip', incantation: 'Lumos' }),
    { ok: false, reason: 'not_practiced', events: [] });
  assert.deepEqual(world.step(), []);
});

test('a helpful teacher can refuse when distrusting the student; no magic knowledge leaks', () => {
  const { world, lily, remus, classroom } = missedLessonAndMeeting();
  world.setTrust(lily, remus, 'distrusted');
  world.execute({ type: 'move', actor: remus, destination: classroom });
  assert.deepEqual(world.step().map(d => d.action.type), ['ask_tutoring']);
  const response = world.step();
  assert.deepEqual(response.map(d => d.action), [
    { type: 'answer_tutoring', actor: lily, requester: remus, spell: 'lumos', accept: false }
  ]);
  assert.deepEqual(world.assistance(remus), []);
  assert.equal(world.tutoringRequest(remus), null);
  assert.deepEqual(world.knowledgeGaps(remus), ['lumos']);
  assert.deepEqual(world.step(), []);
});

test('non-helpful first contact is approached without knowledge of who can teach', () => {
  const { world, lily, remus, classroom } = missedLessonAndMeeting();
  const stranger = world.character('stranger', 'Незнакомец', classroom);
  world.setTrust(remus, stranger, 'trusted');
  world.setTrust(remus, lily, 'neutral');
  world.execute({ type: 'move', actor: remus, destination: classroom });
  const first = world.step();
  assert.deepEqual(first.map(d => d.action), [
    { type: 'ask_tutoring', actor: remus, listener: stranger, spell: 'lumos' }
  ]);
  assert.deepEqual(world.step().map(d => d.action), [
    { type: 'answer_tutoring', actor: stranger, requester: remus, spell: 'lumos', accept: false }
  ]);
  assert.equal(world.spellStage(remus, 'lumos'), 'unaware');
  assert.deepEqual(world.step().map(d => d.action), [
    { type: 'ask_tutoring', actor: remus, listener: lily, spell: 'lumos' }
  ]);
  assert.deepEqual(world.step().map(d => d.action), [
    { type: 'answer_tutoring', actor: lily, requester: remus, spell: 'lumos', accept: true }
  ]);
  assert.equal(world.spellStage(remus, 'lumos'), 'conceptual');
});

test('a lesson-first helper postpones tutoring until actually free', () => {
  const { world, lily, remus, classroom } = missedLessonAndMeeting();
  world.setTimetable(lily, [
    { id: 'next', subject: 'Дополнительные занятия', room: classroom,
      startsAt: 600, endsAt: 630 }
  ], 'lesson_first');
  world.execute({ type: 'move', actor: remus, destination: classroom });
  assert.deepEqual(world.step().map(d => d.action.type), ['ask_tutoring']); // 09:30
  assert.equal(world.tutoringRequest(remus)?.helper, lily);
  assert.deepEqual(world.step(), []); // 09:40, class preparation / occupancy
  assert.deepEqual(world.step(), []); // 09:50
  assert.deepEqual(world.step(), []); // 10:00
  assert.deepEqual(world.step(), []); // 10:10
  assert.deepEqual(world.step(), []); // 10:20
  assert.deepEqual(world.step().map(d => d.action.type), ['answer_tutoring']); // 10:30
  assert.equal(world.spellStage(remus, 'lumos'), 'conceptual');
});

test('a remote or unneeded request does not become telepathic teaching', () => {
  const { world, lily, remus } = missedLessonAndMeeting();
  assert.deepEqual(world.execute({ type: 'ask_tutoring', actor: remus, listener: lily, spell: 'lumos' }),
    { ok: false, reason: 'not_colocated', events: [] });
  assert.equal(world.tutoringRequest(remus), null);
  const copy = world.assistance(remus);
  copy.push({ helper: lily, spell: 'lumos', minute: 10 });
  assert.deepEqual(world.assistance(remus), []);
});

test('a requester cannot re-ask the same peer indefinitely after refusal', () => {
  const { world, lily, remus, classroom } = missedLessonAndMeeting();
  world.setHelpful(lily, false);
  world.execute({ type: 'move', actor: remus, destination: classroom });
  const request = world.execute({ type: 'ask_tutoring', actor: remus, listener: lily, spell: 'lumos' });
  assert.equal(request.ok, true);
  assert.deepEqual(world.execute({ type: 'ask_tutoring', actor: remus, listener: lily, spell: 'lumos' }),
    { ok: false, reason: 'already_requested', events: [] });
  world.step(); // Lily declines
  assert.deepEqual(world.execute({ type: 'ask_tutoring', actor: remus, listener: lily, spell: 'lumos' }),
    { ok: false, reason: 'already_requested', events: [] });
  assert.deepEqual(world.step(), []);
});

test('acceptance requires a real pending request and genuine knowledge', () => {
  const { world, remus, lily, classroom } = missedLessonAndMeeting();
  world.execute({ type: 'move', actor: remus, destination: classroom });
  assert.deepEqual(world.execute({
    type: 'answer_tutoring', actor: lily, requester: remus, spell: 'lumos', accept: true
  }), { ok: false, reason: 'no_pending_request', events: [] });
  const uninformed = world.character('uninformed', 'Первокурсник', classroom);
  assert.equal(world.execute({ type: 'ask_tutoring', actor: remus, listener: uninformed, spell: 'lumos' }).ok, true);
  assert.deepEqual(world.execute({
    type: 'answer_tutoring', actor: uninformed, requester: remus, spell: 'lumos', accept: true
  }), { ok: false, reason: 'not_understood', events: [] });
  assert.equal(world.spellStage(remus, 'lumos'), 'unaware');
  assert.equal(world.tutoringRequest(remus)?.helper, uninformed);
  assert.equal(world.execute({
    type: 'answer_tutoring', actor: uninformed, requester: remus, spell: 'lumos', accept: false
  }).ok, true);
  assert.equal(world.tutoringRequest(remus), null);
});

test('help cannot occur across rooms after a student moves away; later reunion works', () => {
  const { world, remus, lily, classroom, corridor } = missedLessonAndMeeting();
  world.execute({ type: 'move', actor: remus, destination: classroom });
  world.step(); // Remus asks
  world.execute({ type: 'move', actor: remus, destination: corridor });
  world.setRoutine(remus, []); // the student's former arrival plan is complete
  assert.deepEqual(world.step(), []); // helper cannot teleport help
  assert.equal(world.spellStage(remus, 'lumos'), 'unaware');
  world.execute({ type: 'move', actor: remus, destination: classroom });
  assert.deepEqual(world.step().map(d => d.action.type), ['answer_tutoring']);
});

test('social learning stores distinct relationship memory without inventing trust changes', () => {
  const { world, remus, lily, classroom } = missedLessonAndMeeting();
  world.setTrust(remus, lily, 'neutral');
  world.execute({ type: 'move', actor: remus, destination: classroom });
  world.step(); world.step();
  assert.equal(world.trustOf(remus, lily), 'neutral');
  assert.equal(world.hasHelped(lily, remus), true);
  const memories = world.assistance(remus);
  memories[0]!.helper = 99999;
  assert.equal(world.assistance(remus)[0]?.helper, lily);
});

test('social knowledge and pending requests are private to each simulation instance', () => {
  const first = missedLessonAndMeeting();
  const second = missedLessonAndMeeting();
  first.world.execute({ type: 'move', actor: first.remus, destination: first.classroom });
  first.world.step();
  assert.ok(first.world.tutoringRequest(first.remus));
  assert.equal(second.world.tutoringRequest(second.remus), null);
  assert.equal(second.world.hasHelped(second.lily, second.remus), false);
  assert.deepEqual(second.world.assistance(second.remus), []);
});

test('willingness is an explicit rule, not a numerical affection probability', () => {
  assert.equal(willingToTutor({
    helpful: true, trustsRequester: 'neutral', knowsConcept: true, learnerNeedsConcept: true
  }), true);
  assert.equal(willingToTutor({
    helpful: true, trustsRequester: 'distrusted', knowsConcept: true, learnerNeedsConcept: true
  }), false);
  assert.equal(willingToTutor({
    helpful: true, trustsRequester: 'trusted', knowsConcept: false, learnerNeedsConcept: true
  }), false);
});


test('competing duties cause late arrival and later voluntary help without steering commands', () => {
  const world = createSimulation();
  const classroom = world.room('classroom', 'Класс чар');
  const landing = world.room('landing', 'Лестничная площадка');
  const corridor = world.room('corridor', 'Дальний коридор');
  world.connect(classroom, landing);
  world.connect(landing, corridor);
  const lily = world.character('lily', 'Лили', classroom);
  const remus = world.character('remus', 'Ремус', corridor);
  const james = world.character('james', 'Джеймс', corridor);
  const peter = world.character('peter', 'Питер', corridor);
  const cup = world.fragileObject('cup', 'Чашка', corridor);
  for (const [source, claimed] of [[james, james], [peter, peter]] as const) {
    const result = world.execute({
      type: 'tell', actor: source, listener: remus,
      claim: { kind: 'broke_object', culprit: claimed, object: cup }
    });
    assert.equal(result.ok, true);
  }
  const lesson = {
    id: 'lumos_class', subject: 'Чары', room: classroom,
    startsAt: 510, endsAt: 550, spell: 'lumos' as const
  };
  world.setTimetable(lily, [lesson], 'lesson_first');
  world.setTimetable(remus, [lesson], 'inquiry_first');
  world.setInquisitive(remus, true);
  world.setSocialInvestigator(remus, true);
  world.setHelpSeeking(remus, true);
  world.setHelpful(lily, true);
  world.setTrust(remus, lily, 'trusted');
  world.setTrust(remus, james, 'distrusted');
  world.setTrust(remus, peter, 'distrusted');

  const timeline = Array.from({ length: 9 }, () =>
    world.step().map(({ actor, action }) => [actor, action.type]));

  assert.deepEqual(timeline, [
    [[remus, 'inspect_object']],
    [[remus, 'ask_about']],
    [[remus, 'ask_about']],
    [[remus, 'move']],
    [[remus, 'move']],
    [],
    [[remus, 'ask_tutoring']],
    [[lily, 'answer_tutoring']],
    []
  ]);
  assert.equal(world.attendance(lily)[0]?.status, 'on_time');
  assert.equal(world.attendance(remus)[0]?.status, 'late');
  assert.equal(world.spellStage(lily, 'lumos'), 'conceptual');
  assert.equal(world.spellStage(remus, 'lumos'), 'conceptual');
  assert.equal(world.learningHistory(remus)[0]?.source.kind, 'tutoring');
  assert.deepEqual(world.assistance(remus), [{ helper: lily, spell: 'lumos', minute: 560 }]);
  assert.equal(world.events().some(e => e.type === 'object_broken'), false);
});
