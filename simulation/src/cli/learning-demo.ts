import { createSimulation } from '../core/Simulation.ts';

const world = createSimulation();
const classroom = world.room('classroom', 'Класс чар');
const corridor = world.room('corridor', 'Коридор');
const lily = world.character('lily', 'Лили Эванс', classroom);
const remus = world.character('remus', 'Ремус Люпин', corridor);
const james = world.character('james', 'Джеймс Поттер', classroom);
const professor = world.character('professor', 'Профессор чар', classroom);
world.seedSpellKnowledge(professor, 'lumos', 'independent');

const lesson = { id: 'lumos_class', subject: 'Чары: основы света',
  room: classroom, startsAt: 510, endsAt: 550, spell: 'lumos' as const };
world.setTimetable(lily, [lesson], 'lesson_first');
world.setTimetable(james, [lesson], 'lesson_first');
world.setTimetable(remus, [lesson], 'lesson_first');

for (let i = 0; i < 8; i++) world.step(); // class ends: 09:20
console.log('Мародёры / Эксперимент №7 — урок и Lumos');
console.log('08:40 — Лили получила:', world.spellStage(lily, 'lumos'));
console.log('08:40 — Джеймс получил:', world.spellStage(james, 'lumos'));
console.log('Ремус пропустил занятие:', world.attendance(remus)[0]?.status);
console.log('Конкретный пробел Ремуса:', JSON.stringify(world.knowledgeGaps(remus)));

const pattern = { spell: 'lumos' as const, intent: 'illuminate', target: 'wand_tip', incantation: 'Lumos' };
console.log('Джеймс пробует исполнить без практики:',
  JSON.stringify(world.execute({ type: 'cast_spell', actor: james, ...pattern })));
console.log('Практика Джеймса с профессором:',
  JSON.stringify(world.execute({ type: 'practice_spell', actor: james, guide: professor, ...pattern })));

world.setExperimenter(james, true);
console.log('Следующий тик — самостоятельный опыт Джеймса:',
  JSON.stringify(world.step()));
console.log('Джеймс умеет:', world.spellStage(james, 'lumos'),
  'палочка освещена:', world.isIlluminated(james));

world.connect(classroom, corridor);
const moved = world.execute({ type: 'move', actor: remus, destination: classroom });
if (!moved.ok) throw new Error(moved.reason);
console.log('Лили объясняет Ремусу теорию:',
  JSON.stringify(world.execute({ type: 'tutor_spell', actor: lily, listener: remus, spell: 'lumos' })));
console.log('Теперь Ремус знает:', world.spellStage(remus, 'lumos'),
  'но самостоятельный Lumos:', JSON.stringify(world.execute({ type: 'cast_spell', actor: remus, ...pattern })));
console.log('Оставшийся пробел:', JSON.stringify(world.knowledgeGaps(remus)));
