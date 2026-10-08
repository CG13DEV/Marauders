import test from 'node:test';
import assert from 'node:assert/strict';
import { createSchoolWeek, HOUSES } from '../src/scenarios/school-week.ts';
import { createPersistentSimulation, restoreCheckpoint, restoreSimulation } from '../src/core/persistence.ts';

function reachableWithout(
  world: ReturnType<typeof createSchoolWeek>['world'],
  from: number, target: number, blocked: Set<number> = new Set()
): boolean {
  if (blocked.has(from) || blocked.has(target)) return false;
  const visited = new Set([from]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const room = queue[i]!;
    if (room === target) return true;
    for (const next of world.exits(room)) {
      if (!blocked.has(next) && !visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

test('castle graph contains separate landings, multiple floors and useful destinations', () => {
  const { world, layout } = createSchoolWeek();
  assert.equal(layout.places.size, 79);
  assert.deepEqual([...new Set([...layout.places.values()].map(p => p.floor))].sort((a,b)=>a-b),
    [-1,0,1,2,3,4,5,6,7]);
  assert.equal(layout.places.get('hospital_wing')?.kind, 'hospital');
  assert.equal(layout.places.get('hospital_wing')?.floor, 1);
  assert.equal(layout.places.get('library')?.kind, 'library');
  assert.equal(layout.places.get('library')?.floor, 4);
  assert.equal(layout.places.get('courtyard')?.kind, 'courtyard');
  assert.equal(layout.places.get('courtyard')?.floor, 0);
  assert.equal(layout.places.get('great_hall')?.kind, 'dining');
  const roomIds=[...layout.places.values()].map(x=>x.id);
  assert.equal(new Set(roomIds).size,79);
  for(const room of roomIds) {
    if (room !== layout.roomOfRequirement)
      assert.equal(reachableWithout(world,room,layout.hall),true);
  }
  assert.equal(reachableWithout(world,layout.roomOfRequirement,layout.hall),false);
});

test('two stair routes and the courtyard allow travel without the old universal central hub', () => {
  const { world, layout } = createSchoolWeek();
  const bottomWest = layout.landings[-1].west;
  const topEast = layout.landings[4].east;
  assert.equal(reachableWithout(world,bottomWest,topEast),true);
  assert.equal(reachableWithout(world,bottomWest,topEast,new Set([layout.hall])),true);
  assert.equal(reachableWithout(world,layout.landings[0].west,layout.landings[0].east,
    new Set([layout.landings[0].gallery])),true);
  assert.ok(world.exits(layout.courtyard).includes(layout.landings[0].east));
  assert.ok(world.exits(layout.courtyard).includes(layout.landings[0].west));
});

test('every house has a shared central hub with two isolated bedroom branches', () => {
  const { world,layout,students }=createSchoolWeek();
  for (const house of HOUSES) {
    const {common,boys,girls,floor}=layout.dorms[house];
    assert.notEqual(boys,girls);
    assert.notEqual(common,boys);
    assert.deepEqual(world.exits(boys),[common]);
    assert.deepEqual(world.exits(girls),[common]);
    assert.ok(world.exits(common).includes(boys));
    assert.ok(world.exits(common).includes(girls));
    for(const bedroom of [boys,girls]) {
      const node=[...layout.places.values()].find(x=>x.id===bedroom);
      assert.equal(node?.kind,'bedroom');
      assert.equal(node?.house,house);
      assert.equal(node?.floor,floor);
    }
  }
  for(const student of students) {
    assert.equal(world.currentRoom(student.id),layout.dorms[student.house][student.dormGroup]);
  }
});

test('leisure spaces are optional, not mandatory corridors between students', () => {
  const {world,layout,students}=createSchoolWeek();
  const pair=students.filter(x=>x.year===1&&x.house==='gryffindor');
  assert.equal(pair.length,3);
  // One dormitory member may stay in the house while others choose public places.
  const home=layout.dorms.gryffindor.common;
  assert.equal(reachableWithout(world,home,layout.courtyard),true);
  assert.equal(reachableWithout(world,home,layout.library),true);
  assert.ok(!world.exits(home).includes(layout.courtyard));
  assert.ok(!world.exits(home).includes(layout.library));
  assert.notEqual(layout.dorms.gryffindor.common,layout.dorms.slytherin.common);
});

test('floor and room-purpose metadata belong to the world and survive checkpoint restoration', () => {
  const w = createPersistentSimulation();
  const {layout}=createSchoolWeek(w);
  const original = w.roomInfo(layout.library);
  assert.deepEqual(original, {floor:4,wing:'east',kind:'library',loreStatus:'INFERENCE',loreSource:'https://www.hp-lexicon.org/place/hogwarts-school-of-witchcraft-and-wizardry/hogwarts-fourth-floor/library/'});
  original!.floor = 999;
  assert.equal(w.roomInfo(layout.library)?.floor,4);
  const restored=restoreCheckpoint(w.checkpoint());
  const id=restored.id('library')!;
  assert.deepEqual(restored.roomInfo(id), {floor:4,wing:'east',kind:'library',loreStatus:'INFERENCE',loreSource:'https://www.hp-lexicon.org/place/hogwarts-school-of-witchcraft-and-wizardry/hogwarts-fourth-floor/library/'});
  const v1=restoreSimulation(w.snapshot());
  assert.deepEqual(v1.roomInfo(v1.id('hospital_wing')!), {
    floor:1,wing:'west',kind:'hospital',loreStatus:'INFERENCE',loreSource:'https://www.hp-lexicon.org/place/hogwarts-school-of-witchcraft-and-wizardry/hogwarts-third-floor/hospital-wing/'
  });
});

test('spatial metadata is stable through a populated week of character movement', () => {
  const {world,layout}=createSchoolWeek();
  for(let i=0;i<40;i++) world.step();
  assert.equal(world.roomInfo(layout.dorms.gryffindor.girls)?.house,'gryffindor');
  assert.equal(world.roomInfo(layout.courtyard)?.floor,0);
  assert.equal(world.roomInfo(layout.classrooms.Charms)?.floor,3);
});
