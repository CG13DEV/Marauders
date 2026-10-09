import { createSimulation } from '../core/Simulation.ts';

/** Lily sees James break the cup; Remus hears a crash behind a closed door. */
export function createBrokenCupScenario(options: { doorOpen?: boolean } = {}) {
  const world = createSimulation();
  const classroom = world.room('classroom', 'Класс чар');
  const corridor = world.room('corridor', 'Коридор у класса');
  const library = world.room('library', 'Библиотека');
  const door = world.connect(classroom, corridor, {
    door: { key: 'classroom_door', label: 'Дверь класса', open: options.doorOpen ?? false }
  });
  if (door === undefined) throw new Error('Classroom door was not created');
  // The library is intentionally unconnected: Peter cannot hear the crash.
  const lily = world.character('lily_evans', 'Лили Эванс', classroom);
  const james = world.character('james_potter', 'Джеймс Поттер', classroom);
  const remus = world.character('remus_lupin', 'Ремус Люпин', corridor);
  const peter = world.character('peter_pettigrew', 'Питер Петтигрю', library);
  const cup = world.fragileObject('cup', 'Фарфоровая чашка', classroom);
  return { world, classroom, corridor, library, door, lily, james, remus, peter, cup };
}
