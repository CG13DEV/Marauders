import { createSimulation } from '../core/Simulation.ts';

/**
 * A complete causal mini-day. After initial conditions, no external command
 * steers Remus or Lily: their competing obligations drive the outcome.
 */
const world = createSimulation();
const classroom = world.room('classroom', 'Класс чар');
const landing = world.room('landing', 'Лестничная площадка');
const corridor = world.room('corridor', 'Дальний коридор');
world.connect(classroom, landing);
world.connect(landing, corridor);

const lily = world.character('lily', 'Лили Эванс', classroom);
const remus = world.character('remus', 'Ремус Люпин', corridor);
const james = world.character('james', 'Джеймс Поттер', corridor);
const peter = world.character('peter', 'Питер Петтигрю', corridor);
const cup = world.fragileObject('cup', 'Чашка', corridor);

function tell(actor: number, culprit: number) {
  const result = world.execute({
    type: 'tell', actor, listener: remus,
    claim: { kind: 'broke_object', culprit, object: cup }
  });
  if (!result.ok) throw new Error('Could not establish initial testimony');
}
tell(james, james);
tell(peter, peter);

const classInfo = {
  id: 'lumos_class', subject: 'Чары: основы света',
  room: classroom, startsAt: 510, endsAt: 550, spell: 'lumos' as const
};
world.setTimetable(lily, [classInfo], 'lesson_first');
world.setTimetable(remus, [classInfo], 'inquiry_first');

world.setInquisitive(remus, true);
world.setSocialInvestigator(remus, true);
world.setHelpSeeking(remus, true);
world.setHelpful(lily, true);
world.setTrust(remus, lily, 'trusted');
world.setTrust(remus, james, 'distrusted');
world.setTrust(remus, peter, 'distrusted');

console.log('Мародёры / Эксперимент №8: просьба о помощи без сценарных команд');
for (let i = 0; i < 9; i++) {
  const actions = world.step().map(({ actor, action }) => ({
    who: world.label(actor), action: action.type
  }));
  console.log(world.clock().label, JSON.stringify(actions));
}
console.log('Посещаемость Ремуса:', JSON.stringify(world.attendance(remus)));
console.log('Знания Лили:', world.spellStage(lily, 'lumos'));
console.log('Знания Ремуса:', world.spellStage(remus, 'lumos'));
console.log('Помощь:', JSON.stringify(world.assistance(remus)));
console.log('Ремус может выполнить Lumos:', world.spellStage(remus, 'lumos') === 'independent');
