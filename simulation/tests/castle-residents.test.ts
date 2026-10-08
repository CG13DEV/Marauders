import test from 'node:test';
import assert from 'node:assert/strict';
import { createSchoolWeek, HOUSES } from '../src/scenarios/school-week.ts';
import { createPersistentSimulation, restoreCheckpoint, restoreSimulation } from '../src/core/persistence.ts';
import { canManifestRoomOfRequirement } from '../src/scenarios/room-of-requirement.ts';

test('expanded residents, deans and ghost teacher exist without rewriting 96 timetable slots', () => {
  const world = createPersistentSimulation();
  const s = createSchoolWeek(world, 'adaptive', 'autonomous', '96-all', 'expanded');
  assert.equal(s.students.length, 84);
  assert.equal(s.professors.length, 12);
  assert.equal(s.residents?.people.length, 9);
  assert.equal(s.sessions.length, 155);
  assert.deepEqual(new Set(Object.keys(s.residents!.heads)), new Set(HOUSES));
  assert.equal(s.residents!.ghostProfessor,
    s.professors.find(p => p.subject === 'History of Magic')?.id);
  assert.equal(world.label(s.residents!.ghostProfessor), 'Катберт Биннс');
  assert.equal(world.needsOf(s.residents!.ghostProfessor), null);
  assert.equal(world.mealHistory(s.residents!.ghostProfessor).length, 0);
  const kinds = s.residents!.people.map(p=>p.kind);
  assert.equal(kinds.filter(k=>k==='ghost').length,5);
  assert.equal(kinds.filter(k=>k==='poltergeist').length,1);
  assert.equal(kinds.filter(k=>k==='animal').length,1);
  assert.equal(kinds.filter(k=>k==='caretaker').length,1);
  assert.equal(kinds.filter(k=>k==='headmaster').length,1);
  for(const resident of s.residents!.people) {
    assert.equal(world.id(resident.key),resident.id);
    assert.equal(world.currentRoom(resident.id),resident.home);
    assert.equal(world.needsOf(resident.id),null);
    assert.equal(world.attendance(resident.id).length,0);
  }
  assert.equal(world.currentRoom(world.id('ghost_moaning_myrtle')!),
    s.layout.bathrooms[2].girls);
  assert.equal(world.currentRoom(world.id('headmaster_dumbledore')!),
    s.layout.headmasterOffice);
  const cp = restoreCheckpoint(world.checkpoint());
  const journal = restoreSimulation(world.snapshot());
  assert.deepEqual(cp.captureRuntime(),world.captureRuntime());
  assert.deepEqual(journal.captureRuntime(),world.captureRuntime());
});

test('bathrooms exist at every modelled floor; hidden room is never a normal exit', () => {
  const { world,layout }=createSchoolWeek();
  for(let floor=-1; floor<=7; floor++){
    const toilets=layout.bathrooms[floor as keyof typeof layout.bathrooms];
    assert.ok(toilets);
    assert.equal(layout.places.get('boys_bathroom_'+floor)?.kind,'bathroom');
    assert.equal(layout.places.get('girls_bathroom_'+floor)?.kind,'bathroom');
    assert.ok(world.exits(toilets.boys).length>0);
    assert.ok(world.exits(toilets.girls).length>0);
  }
  assert.equal(layout.places.get('room_of_requirement')?.kind,'hidden');
  assert.equal(world.exits(layout.roomOfRequirement).length,0);
  assert.equal(world.exits(layout.requirementApproach).includes(layout.roomOfRequirement),false);
  assert.equal(world.doorIsOpen(world.id('headmaster_office_door')!),false);
});

test('Room of Requirement reveal precondition needs evidence, place and triple passage',()=>{
  const valid = { atSeventhFloorEntrance:true, focusedNeed:'safe place to practise',
    needSupportedByWorld:true, consecutivePasses:3 };
  assert.equal(canManifestRoomOfRequirement(valid),true);
  assert.equal(canManifestRoomOfRequirement({...valid,atSeventhFloorEntrance:false}),false);
  assert.equal(canManifestRoomOfRequirement({...valid,needSupportedByWorld:false}),false);
  assert.equal(canManifestRoomOfRequirement({...valid,consecutivePasses:2}),false);
  assert.equal(canManifestRoomOfRequirement({...valid,focusedNeed:'  '}),false);
  assert.equal(canManifestRoomOfRequirement({...valid,consecutivePasses:3.5}),false);
});
