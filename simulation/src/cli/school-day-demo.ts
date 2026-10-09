import { createBrokenCupScenario } from '../scenarios/broken-cup.ts';

const { world, lily, james, remus, peter, cup, classroom, corridor, library, door } =
  createBrokenCupScenario();

const potionRoom = world.room('potions', 'Кабинет зельеварения');
const greenhouse = world.room('greenhouse', 'Теплица');
world.connect(corridor, library);
world.connect(corridor, potionRoom);
world.connect(corridor, greenhouse);
const act = (command: Parameters<typeof world.execute>[0]) => {
  const result = world.execute(command);
  if (!result.ok) throw new Error('Rejected command: ' + result.reason);
};

act({ type: 'break_object', actor: james, target: cup });
act({ type: 'open_door', actor: lily, door });
act({ type: 'move', actor: remus, destination: classroom });
act({ type: 'tell', actor: lily, listener: remus,
  claim: { kind: 'broke_object', culprit: james, object: cup } });
act({ type: 'tell', actor: james, listener: remus,
  claim: { kind: 'broke_object', culprit: peter, object: cup } });

world.setGuarded(james, true);
world.setTrust(remus, lily, 'trusted');
world.setTrust(remus, james, 'distrusted');
world.setInquisitive(remus, true);
world.setSocialInvestigator(remus, true);

world.setRoutine(lily, [corridor, library]);
world.setTimetable(lily, [
  { id: 'study', subject: 'Работа в библиотеке', room: library, startsAt: 520, endsAt: 550 },
  { id: 'charms', subject: 'Чары', room: classroom, startsAt: 580, endsAt: 610 },
  { id: 'herbology', subject: 'Травология', room: greenhouse, startsAt: 660, endsAt: 710 },
  { id: 'afternoon_study', subject: 'Самостоятельная работа', room: library, startsAt: 840, endsAt: 890 }
], 'lesson_first');
world.setTimetable(remus, [
  { id: 'potions', subject: 'Зельеварение', room: potionRoom, startsAt: 520, endsAt: 570 },
  { id: 'charms', subject: 'Чары', room: classroom, startsAt: 680, endsAt: 720 },
  { id: 'afternoon_study', subject: 'Самостоятельная работа', room: library, startsAt: 840, endsAt: 890 }
], 'inquiry_first');
world.setTimetable(james, [
  { id: 'charms', subject: 'Чары', room: classroom, startsAt: 520, endsAt: 550 },
  { id: 'herbology', subject: 'Травология', room: greenhouse, startsAt: 660, endsAt: 710 },
  { id: 'history', subject: 'История магии', room: classroom, startsAt: 820, endsAt: 870 }
], 'lesson_first');

world.setTimetable(peter, [
  { id: 'library_practice', subject: 'Самостоятельная подготовка', room: library, startsAt: 600, endsAt: 650 },
  { id: 'history', subject: 'История магии', room: classroom, startsAt: 750, endsAt: 800 }
], 'lesson_first');

console.log('Мародёры / Эксперимент №6: полный учебный день, 08:00–16:00');
for (let i = 0; i < 48; i++) {
  const changes = world.step().map(({ actor, action }) =>
    `${world.label(actor)}: ${action.type}`);
  const clock = world.clock();
  if (changes.length > 0) console.log(`${clock.label}: ${changes.join(' | ')}`);
}
for (const student of [lily, remus, james, peter]) {
  console.log(`${world.label(student)}: attendance=${JSON.stringify(world.attendance(student))}; debt=${world.learningDebt(student)}`);
}
console.log('Изменения посещаемости:', JSON.stringify(world.events().filter(e => e.type === 'lesson_attendance')));
console.log('Финальное время:', world.clock().label);
if (world.clock().label !== '16:00') throw new Error('School day did not reach 16:00');
