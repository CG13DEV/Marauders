import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTextSession } from '../src/cli/text-game.ts';
import { restoreSimulation, serializeSimulation } from '../src/core/persistence.ts';

test('player stays player-controlled while pupils independently follow school routines', () => {
  const session = createTextSession();
  const world = session.world();
  const common = world.id('common_room')!;
  const james = world.id('james')!;
  const lily = world.id('lily')!;
  assert.equal(world.currentRoom(james), common);
  assert.match(session.respond('wait 5'), /08:50/);
  assert.equal(world.currentRoom(james), common);
  assert.equal(world.spellStage(james, 'lumos'), 'unaware');
  assert.equal(world.spellStage(lily, 'lumos'), 'conceptual');
  assert.equal(world.attendance(james)[0]?.status, 'pending');
  session.respond('wait 2');
  assert.equal(world.attendance(james)[0]?.status, 'missed');
  assert.deepEqual(world.knowledgeGaps(james), ['lumos']);
});

test('playing a student uses the same lesson, practice and spell rules as NPCs', () => {
  const session = createTextSession();
  assert.match(session.respond('look'), /Гостиная Гриффиндора/);
  assert.match(session.respond('go classroom'), /Переход невозможен|Не получилось пройти/);
  session.respond('go corridor');
  session.respond('go classroom');
  session.respond('wait 2');
  assert.match(session.respond('status'), /Lumos = conceptual/);
  assert.match(session.respond('cast lumos'), /not_practiced/);
  assert.match(session.respond('practice lumos professor'), /guided/);
  assert.match(session.respond('practice lumos'), /independent/);
  assert.match(session.respond('cast lumos'), /свет=true/);
  assert.equal(session.world().isIlluminated(session.world().id('james')!), true);
});

test('a real disk JSON file loads into a fresh text client and keeps gameplay causal', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'marauders-save-test-'));
  try {
    const filename = join(dir, 'school.json');
    const first = createTextSession();
    first.respond('go corridor');
    first.respond('go classroom');
    first.respond('wait 2');
    await writeFile(filename, serializeSimulation(first.world()), 'utf8');
    const second = createTextSession(restoreSimulation(await readFile(filename, 'utf8')));
    assert.equal(second.world().snapshot().audit, first.world().snapshot().audit);
    assert.equal(second.world().spellStage(second.world().id('james')!, 'lumos'), 'conceptual');
    first.respond('practice lumos professor');
    second.respond('practice lumos professor');
    assert.equal(first.world().snapshot().audit, second.world().snapshot().audit);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('invalid moves or commands do not advance game time or corrupt saves', () => {
  const session = createTextSession();
  const tick = session.world().tick();
  assert.match(session.respond('go library'), /Не получилось пройти/);
  assert.match(session.respond('wait 0'), /Допустимо/);
  assert.match(session.respond('cast lumos'), /not_understood/);
  assert.equal(session.world().tick(), tick);
  assert.doesNotThrow(() => restoreSimulation(serializeSimulation(session.world())));
});

test('two text worlds are independent and player actions never teleport a different world', () => {
  const first = createTextSession();
  const second = createTextSession();
  first.respond('go corridor');
  assert.equal(first.world().clock().label, '08:10');
  assert.equal(second.world().clock().label, '08:00');
  assert.match(second.look(), /Гостиная Гриффиндора/);
});
