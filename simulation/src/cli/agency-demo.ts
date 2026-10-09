import { createBrokenCupScenario } from '../scenarios/broken-cup.ts';

const { world, lily, james, peter, remus, cup, door, classroom } = createBrokenCupScenario();

const apply = (command: Parameters<typeof world.execute>[0]) => {
  const result = world.execute(command);
  if (!result.ok) throw new Error('Rejected: ' + result.reason);
};

console.log('Мародёры / Эксперимент №4: Ремус принимает решение');
apply({ type: 'break_object', actor: james, target: cup });
apply({ type: 'open_door', actor: lily, door });
apply({ type: 'move', actor: remus, destination: classroom });
apply({ type: 'tell', actor: lily, listener: remus,
  claim: { kind: 'broke_object', culprit: james, object: cup } });
apply({ type: 'tell', actor: james, listener: remus,
  claim: { kind: 'broke_object', culprit: peter, object: cup } });

world.setTrust(remus, lily, 'trusted');
world.setTrust(remus, james, 'distrusted');
world.setInquisitive(remus, true);

console.log('Ремус: убеждения:', JSON.stringify(world.beliefs(remus)));
console.log('Ремус: оценка:', JSON.stringify(world.assessment(remus, cup)));
console.log('Симуляция — самостоятельное решение:', JSON.stringify(world.step()));
console.log('Ремус: наблюдения:', JSON.stringify(world.observations(remus)));
console.log('Ремус: вторая попытка:', JSON.stringify(world.step()));
console.log('Истина (только отладчик):', JSON.stringify(world.events().find(e => e.type === 'object_broken')));
