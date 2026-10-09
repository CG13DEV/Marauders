import { createInterface } from 'node:readline';
import { readFile, writeFile } from 'node:fs/promises';
import { createTextSession } from './text-game.ts';
import { restoreSimulation, serializeCheckpoint } from '../core/persistence.ts';

const session = createTextSession();

if (process.argv.includes('--demo')) {
  console.log('Мародёры / Интерактивная школа — проверка текстового клиента');
  for (const command of [
    'look', 'go corridor', 'go classroom', 'wait 2',
    'status', 'practice lumos professor', 'practice lumos', 'cast lumos'
  ]) {
    console.log('> ' + command);
    console.log(session.respond(command));
  }
  const save = serializeCheckpoint(session.world());
  const resumed = restoreSimulation(save);
  if (JSON.stringify(resumed.captureRuntime()) !== JSON.stringify(session.world().captureRuntime()))
    throw new Error('Save/load failed during text-game demo');
  session.replaceWorld(resumed);
  console.log('Сохранение восстановлено: ' + session.status());
} else {
  console.log('Мародёры / Текстовая школа: ты играешь за Джеймса Поттера');
  console.log(session.respond('help'));
  console.log(session.look());

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  rl.prompt();
  for await (const line of rl) {
    const [command, ...args] = line.trim().split(/\s+/);
    const path = args.join(' ');
    if (command === 'quit' || command === 'exit') break;
    try {
      if (command === 'save') {
        if (!path) console.log('Укажи путь: save my-school.json');
        else {
          await writeFile(path, serializeCheckpoint(session.world()), 'utf8');
          console.log('Сохранено: ' + path);
        }
      } else if (command === 'load') {
        if (!path) console.log('Укажи путь: load my-school.json');
        else {
          const saved = await readFile(path, 'utf8');
          const next = restoreSimulation(saved);
          session.replaceWorld(next);
          console.log('Мир восстановлен. ' + session.status());
        }
      } else console.log(session.respond(line));
    } catch (error) {
      console.log('Ошибка: ' + (error instanceof Error ? error.message : String(error)));
    }
    rl.prompt();
  }
  rl.close();
}
