import { createBrokenCupScenario } from '../scenarios/broken-cup.ts';

const { world, james, lily, remus, peter, door, classroom, cup } = createBrokenCupScenario();

const apply = (command: Parameters<typeof world.execute>[0]) => {
  const result = world.execute(command);
  if (!result.ok) throw new Error('Command rejected: ' + result.reason);
  return result;
};

console.log('Мародёры / Эксперимент №3: кому верит Ремус?');
apply({ type: 'break_object', actor: james, target: cup });
console.log('Ремус слышал:', JSON.stringify(world.observations(remus)));
console.log('Ремус верит:', JSON.stringify(world.beliefs(remus)));

apply({ type: 'open_door', actor: lily, door });
apply({ type: 'move', actor: remus, destination: classroom });
apply({ type: 'tell', actor: lily, listener: remus,
  claim: { kind: 'broke_object', culprit: james, object: cup } });
apply({ type: 'tell', actor: james, listener: remus,
  claim: { kind: 'broke_object', culprit: peter, object: cup } });

console.log('Лили (очевидец):', JSON.stringify(world.beliefs(lily)));
console.log('Ремус (две версии):', JSON.stringify(world.beliefs(remus)));
console.log('Объективное событие:', JSON.stringify(world.events().find(e => e.type === 'object_broken')));
