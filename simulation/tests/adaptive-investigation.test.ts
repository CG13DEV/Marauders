import test from 'node:test';
import assert from 'node:assert/strict';
import {createPersistentSimulation,restoreCheckpoint,restoreSimulation}
  from '../src/core/persistence.ts';
import {nearbySearchRooms} from '../src/core/resident-life.ts';

test('local search is bounded, deterministic and knows only connected passages',()=>{
  const links:Record<number,number[]>={
    10:[12,11],11:[10,20],12:[21,10],20:[11],21:[12],99:[]
  };
  const exits=(id:number)=>links[id]??[];
  assert.deepEqual(nearbySearchRooms(10,exits,2),[10,11,12,20,21]);
  assert.deepEqual(nearbySearchRooms(10,exits,2,3),[10,11,12]);
  assert.ok(!nearbySearchRooms(10,exits).includes(99));
});

test('a face-to-face Norris alarm causes Filch to leave his fixed beat, inspect locally and resume',()=>{
  const w=createPersistentSimulation();
  const office=w.room('office','Кабинет Филча');
  const passage=w.room('passage','Промежуточный коридор');
  const hall=w.room('hall','Дальний коридор');
  const unreachable=w.room('secret','Недостижимое помещение');
  w.connect(office,passage);
  w.connect(passage,hall);
  const filch=w.character('filch','Аргус Филч',office);
  const norris=w.character('norris','Миссис Норрис',hall);
  const pupil=w.character('pupil','Ученик',hall);
  const cup=w.fragileObject('cup','Разбитая кружка',hall);
  w.configurePatrol(filch,'caretaker',[office]); // normally never leaves office
  w.configurePatrol(norris,'animal',[hall,office],filch,office);
  assert.equal(w.execute({type:'break_object',actor:pupil,target:cup}).ok,true);
  assert.equal(w.observations(filch).length,0);
  w.step();
  w.step();
  assert.equal(w.currentRoom(norris),office);
  assert.equal(w.events().some(e=>e.type==='animal_alerted'),false);
  w.step(); // first actual face-to-face alert
  assert.equal(w.events().filter(e=>e.type==='animal_alerted').length,1);
  const search=w.patrolState(filch)!.search!;
  assert.equal(search.origin,office);
  assert.deepEqual(search.pending,[office,passage,hall]);
  assert.ok(!search.pending.includes(unreachable));
  assert.equal(w.beliefs(filch).length,0);
  assert.deepEqual(w.observations(filch).filter(o=>o.kind==='animal_alert'),
    [{kind:'animal_alert',source:'hearing',actor:norris}]);
  w.step(); // office -> passage, despite fixed waypoint=[office]
  assert.equal(w.currentRoom(filch),passage);
  const cp=restoreCheckpoint(w.checkpoint());
  const jr=restoreSimulation(w.snapshot());
  assert.deepEqual(cp.captureRuntime(),w.captureRuntime());
  assert.deepEqual(jr.captureRuntime(),w.captureRuntime());
  for(let i=0;i<8;i++){w.step();cp.step();jr.step();}
  assert.deepEqual(cp.captureRuntime(),w.captureRuntime());
  assert.deepEqual(jr.captureRuntime(),w.captureRuntime());
  assert.ok(w.events().some(e=>e.type==='object_inspected'&&
    e.actor===filch&&e.target===cup&&e.broken));
  assert.equal(w.beliefs(filch).length,0,
    'finding a broken cup never reveals who broke it');
  assert.equal(w.patrolState(filch)?.search,undefined,
    'finite alert-driven detour ends after checking local rooms');
  assert.equal(w.events().filter(e=>e.type==='animal_alerted').length,1);
});

test('caretaker cannot infer a distant wrong from an unsignalled cat sighting',()=>{
  const w=createPersistentSimulation();
  const office=w.room('office','Кабинет');
  const corridor=w.room('corridor','Коридор');
  w.connect(office,corridor);
  const filch=w.character('filch','Филч',office);
  const cat=w.character('cat','Норрис',corridor);
  const pupil=w.character('pupil','Ученик',corridor);
  const cup=w.fragileObject('cup','Кружка',corridor);
  w.configurePatrol(filch,'caretaker',[office]);
  w.configurePatrol(cat,'animal',[corridor,office],filch,office);
  w.execute({type:'break_object',actor:pupil,target:cup});
  assert.equal(w.patrolState(filch)?.search,undefined);
  // A crash may be heard in an adjacent corridor, but hearing is NOT an
  // eyewitness identification and cannot substitute for the cat's alert.
  assert.equal(w.observations(filch).some(o=>o.kind==='witnessed_breakage'),false);
  assert.equal(w.beliefs(filch).length,0);
  assert.equal(w.execute({type:'signal_incident',actor:cat,listener:filch}).ok,false);
  assert.equal(w.patrolState(filch)?.search,undefined);
});
