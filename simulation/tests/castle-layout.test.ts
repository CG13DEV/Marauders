import test from 'node:test';
import assert from 'node:assert/strict';
import { createSchoolWeek, HOUSES } from '../src/scenarios/school-week.ts';

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
  assert.equal(layout.places.size, 42);
  assert.deepEqual([...new Set([...layout.places.values()].map(p => p.floor))].sort((a,b)=>a-b),
    [-1,0,1,2,3,4]);
  assert.equal(layout.places.get('hospital_wing')?.kind, 'hospital');
  assert.equal(layout.places.get('hospital_wing')?.floor, 1);
  assert.equal(layout.places.get('library')?.kind, 'library');
  assert.equal(layout.places.get('library')?.floor, 2);
  assert.equal(layout.places.get('courtyard')?.kind, 'courtyard');
  assert.equal(layout.places.get('courtyard')?.floor, 0);
  assert.equal(layout.places.get('great_hall')?.kind, 'dining');
  const roomIds=[...layout.places.values()].map(x=>x.id);
  assert.equal(new Set(roomIds).size,42);
  for(const room of roomIds) assert.equal(reachableWithout(world,room,layout.hall),true);
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
