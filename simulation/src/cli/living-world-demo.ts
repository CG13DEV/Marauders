import { createBrokenCupScenario } from '../scenarios/broken-cup.ts';

const { world, classroom, corridor, library, lily, remus, james, peter, cup, door } =
  createBrokenCupScenario();
world.connect(corridor, library);

function act(command: Parameters<typeof world.execute>[0]): void {
  const result = world.execute(command);
  if (!result.ok) throw new Error(`Rejected: ${result.reason}`);
}

act({ type: 'break_object', actor: james, target: cup });
act({ type: 'open_door', actor: lily, door });
act({ type: 'move', actor: remus, destination: classroom });
act({ type: 'tell', actor: lily, listener: remus,
  claim: { kind: 'broke_object', culprit: james, object: cup } });
act({ type: 'tell', actor: james, listener: remus,
  claim: { kind: 'broke_object', culprit: peter, object: cup } });

world.setTrust(remus, lily, 'trusted');
world.setTrust(remus, james, 'distrusted');
world.setGuarded(james, true);
world.setInquisitive(remus, true);
world.setSocialInvestigator(remus, true);
// Nobody commands Lily to move after this point: she follows her own itinerary.
world.setRoutine(lily, [corridor, library]);

console.log('Мародёры / Эксперимент №5 — живой школьный день');
for (let i = 0; i < 7; i++) {
  const outcomes = world.step();
  const actions = outcomes.map(({ actor, action, result }) => ({
    who: world.label(actor), action, ok: result.ok,
    events: result.events.map(e => e.type)
  }));
  console.log(`Тик ${world.tick()}: ${JSON.stringify(actions)}`);
}
console.log('Лили находится:', world.label(world.currentRoom(lily)!));
console.log('Ремус находится:', world.label(world.currentRoom(remus)!));
console.log('Ремус знает:', JSON.stringify(world.beliefs(remus)));
console.log('Ремус наблюдал:', JSON.stringify(world.observations(remus)));
console.log('Истина (только отладка):', JSON.stringify(world.events().find(e => e.type === 'object_broken')));
