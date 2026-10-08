import { createBrokenCupScenario } from '../scenarios/broken-cup.ts';

const { world, james, lily, remus, peter, cup, door } = createBrokenCupScenario();
console.log('Мародёры / Эксперимент №2: кто разбил чашку?');
console.log(`Дверь закрыта: ${world.doorIsOpen(door) === false ? 'да' : 'нет'}`);

const result = world.execute({ type: 'break_object', actor: james, target: cup });
if (!result.ok) throw new Error(`Break failed: ${result.reason}`);

for (const student of [lily, remus, peter]) {
  console.log(`${world.label(student)}: ${JSON.stringify(world.observations(student))}`);
}
console.log(`Мировое событие (только для отладки): ${JSON.stringify(result.events[0])}`);
