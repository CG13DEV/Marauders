import { createSimulation } from '../core/Simulation.ts';

export function createFirstRoom() {
  const world = createSimulation();
  const commonRoom = world.room('common_room', 'Гостиная Гриффиндора');
  const corridor = world.room('corridor', 'Коридор');
  const library = world.room('library', 'Библиотека');
  world.connect(commonRoom, corridor);
  world.connect(corridor, library);
  const lily = world.character('lily_evans', 'Лили Эванс', commonRoom);
  return { world, lily, commonRoom, corridor, library };
}
