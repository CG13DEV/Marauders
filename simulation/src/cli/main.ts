import { createInterface } from 'node:readline';
import { createFirstRoom } from '../scenarios/first-room.ts';

const { world, lily, corridor } = createFirstRoom();

function look(): void {
  const place = world.currentRoom(lily);
  if (place === null) throw new Error('Lily has no location');
  console.log(`\n${world.label(place)}`);
  console.log(`Здесь: ${world.occupants(place).map(id => world.label(id)).join(', ')}`);
  console.log(`Выходы: ${world.exits(place).map(id => `${world.label(id)} (${id})`).join(', ')}`);
}

function move(to: number): void {
  const result = world.execute({ type: 'move', actor: lily, destination: to });
  if (!result.ok) {
    console.log(`Переход невозможен: ${result.reason}`);
    return;
  }
  console.log(`Лили переходит: ${world.label(result.events[0]!.from)} → ${world.label(to)}.`);
}

if (process.argv.includes('--demo')) {
  console.log('Мародёры / Первая лаборатория');
  look();
  move(corridor);
  look();
  console.log(`События: ${JSON.stringify(world.events())}`);
} else {
  console.log('Мародёры / Первая лаборатория. Команды: look, go <room_key>, events, help, exit');
  look();
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  rl.prompt();
  rl.on('line', (line) => {
    const [action, target] = line.trim().split(/\s+/, 2);
    if (action === 'exit' || action === 'quit') { rl.close(); return; }
    if (action === 'look') look();
    else if (action === 'events') console.log(JSON.stringify(world.events(), null, 2));
    else if (action === 'go') {
      const id = target ? world.id(target) : undefined;
      if (id === undefined) console.log('Неизвестное помещение. Пример: go corridor');
      else move(id);
    } else if (action === 'help') console.log('look | go common_room | go corridor | go library | events | exit');
    else console.log('Неизвестная команда. Напиши help.');
    rl.prompt();
  });
}
