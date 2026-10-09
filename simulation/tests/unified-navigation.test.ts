import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/Simulation.ts';
import {createPersistentSimulation,restoreCheckpoint,restoreSimulation}
  from '../src/core/persistence.ts';
import {createSchoolWeek} from '../src/scenarios/school-week.ts';
import {actorJourneyDuration} from '../src/core/actor-navigation.ts';

function junction(persistent=false){
  const w=persistent?createPersistentSimulation():createSimulation();
  const a=w.room('a','Вестибюль');
  const b=w.room('b','Медленная лестница');
  const c=w.room('c','Боковой коридор');
  const d=w.room('d','Библиотека');
  w.connect(a,b,{travelMinutes:8});
  w.connect(b,d,{travelMinutes:8});
  w.connect(a,c,{travelMinutes:3});
  w.connect(c,d,{travelMinutes:4});
  w.connect(a,d,{travelMinutes:2,hidden:true});
  return {w,a,b,c,d};
}

test('#30: every independent routine shares personally known weighted routes',()=>{
  const {w,a,c,d}=junction();
  const ordinary=w.character('ordinary','Первый ученик',a);
  const explorer=w.character('explorer','Второй ученик',a);
  for(const actor of [ordinary,explorer]){
    w.setTravelMode(actor,'unified-30');
    w.setRoutine(actor,[d]);
  }
  assert.equal(actorJourneyDuration(w,ordinary,a,d),7);
  assert.equal(actorJourneyDuration(w,explorer,a,d),7);
  assert.ok(w.execute({type:'search_passages',actor:explorer}).ok);
  assert.equal(actorJourneyDuration(w,explorer,a,d),2);
  assert.equal(actorJourneyDuration(w,ordinary,a,d),7);
  const decisions=w.step();
  const moving=decisions.filter(x=>x.action.type==='move'&&x.result.ok);
  assert.deepEqual(moving.filter(x=>x.actor===ordinary)
    .map(x=>x.action.type==='move'?x.action.destination:-1),[c,d]);
  assert.deepEqual(moving.filter(x=>x.actor===explorer)
    .map(x=>x.action.type==='move'?x.action.destination:-1),[d]);
  assert.equal(w.currentRoom(ordinary),d);
  assert.equal(w.currentRoom(explorer),d);
  assert.equal(w.passageDiscoveries(ordinary).length,0);
  assert.equal(w.passageDiscoveries(explorer).length,1);
});

test('#30: caretaker and cat use common weighted physics for patrol destinations',()=>{
  const {w,a,c,d}=junction();
  const caretaker=w.character('filch','Филч',a);
  const cat=w.character('norris','Миссис Норрис',a);
  w.configurePatrol(caretaker,'caretaker',[a,d]);
  w.configurePatrol(cat,'animal',[a,d],caretaker,a);
  w.setTravelMode(caretaker,'unified-30');
  w.setTravelMode(cat,'unified-30');
  const decisions=w.step();
  for(const actor of [caretaker,cat]){
    assert.equal(w.currentRoom(actor),d);
    const movement=decisions.filter(x=>x.actor===actor&&x.action.type==='move');
    assert.deepEqual(movement.map(x=>x.action.type==='move'?x.action.destination:-1),
      [c,d]);
    assert.ok(movement.every(x=>x.result.ok));
    assert.ok(!w.knownExits(actor,a).includes(d));
  }
});

test('#30: all named school inhabitants including staff and patrol NPCs opt in',()=>{
  const s=createSchoolWeek(createSimulation(),'adaptive','autonomous',
    '96-all','expanded','research-600','foundations-27','unified-30');
  const ids=[
    ...s.students.map(x=>x.id),...s.professors.map(x=>x.id),
    ...s.residents!.people.map(x=>x.id)
  ];
  assert.equal(s.travel,'unified-30');
  assert.equal(ids.length,634);
  assert.ok(ids.every(id=>s.world.usesUnifiedTravel(id)));
  assert.equal(s.world.passageDiscoveries(s.students[0]!.id).length,0);
  assert.ok(s.world.usesUnifiedTravel(s.residents!.people.find(
    p=>p.key==='caretaker_filch')!.id));
  assert.ok(s.world.usesUnifiedTravel(s.residents!.people.find(
    p=>p.key==='mrs_norris')!.id));
});

test('#30: bounded physical travel to meals, actual consumption only in dining room',()=>{
  const {w,a,c,d}=junction();
  const pupil=w.character('pupil','Ученица',a);
  w.setTravelMode(pupil,'unified-30');
  w.setDailyLife(pupil,{
    homeRoom:a,diningRoom:d,leisureRoom:a,socialRoom:a,
    style:'reserved',interest:'lessons',schoolPlanning:'adaptive'
  });
  let walkedToFood=false;
  for(let tick=0;tick<54;tick++){
    const decisions=w.step();
    const moves=decisions.filter(x=>x.actor===pupil&&x.action.type==='move');
    if(moves.length===2){
      assert.deepEqual(moves.map(x=>x.action.type==='move'?x.action.destination:-1),
        [c,d]);
      walkedToFood=true;
    }
    assert.ok(w.mealHistory(pupil).every(m=>m.minute>=480));
  }
  assert.ok(walkedToFood,'the same ten-minute tick traverses both real public rooms');
  assert.ok(w.mealHistory(pupil).some(m=>m.kind==='breakfast'));
});

test('#30: manual control cannot be hijacked by unified navigation',()=>{
  const {w,a,d}=junction();
  const actor=w.character('player','Игрок',a);
  w.setTravelMode(actor,'unified-30');
  w.setRoutine(actor,[d]);
  w.setManualControl(actor,true);
  for(let i=0;i<4;i++)assert.deepEqual(w.step(),[]);
  assert.equal(w.currentRoom(actor),a);
});

test('#30: travel policy and private secrets replay via V1 and checkpoint V2',()=>{
  const {w:world,a,d}=junction(true);
  const w=world as ReturnType<typeof createPersistentSimulation>;
  const actor=w.character('pupil','Ученица',a);
  w.setTravelMode(actor,'unified-30');
  w.setRoutine(actor,[d]);
  w.execute({type:'search_passages',actor});
  const restoreV1=restoreSimulation(w.snapshot());
  const restoreV2=restoreCheckpoint(w.checkpoint());
  for(const saved of [restoreV1,restoreV2]){
    assert.ok(saved.usesUnifiedTravel(actor));
    assert.equal(actorJourneyDuration(saved,actor,a,d),2);
    assert.deepEqual(saved.captureRuntime(),w.captureRuntime());
  }
  for(let step=0;step<2;step++){
    w.step();restoreV1.step();restoreV2.step();
    assert.deepEqual(restoreV1.captureRuntime(),w.captureRuntime());
    assert.deepEqual(restoreV2.captureRuntime(),w.captureRuntime());
  }
  assert.equal(w.currentRoom(actor),d);
  assert.throws(()=>w.setTravelMode(-999,'unified-30'),/requires a character/);
});

test('#30: shared routing cache is isolated, defensive, and invalidated by topology edits',()=>{
  const {w,a,d}=junction();
  const pupil=w.character('cache_pupil','Проверка карты',a);
  const other=w.character('cache_other','Проверка знания',a);
  w.setTravelMode(pupil,'unified-30');
  w.setTravelMode(other,'unified-30');
  const original=w.planActorRoute(pupil,a,d)!;
  assert.equal(original.minutes,7);
  original.rooms.splice(0);
  assert.equal(w.planActorRoute(other,a,d)?.minutes,7);
  assert.equal(w.planActorRoute(other,a,d)?.rooms[0],a);
  w.execute({type:'search_passages',actor:pupil});
  assert.equal(w.planActorRoute(pupil,a,d)?.minutes,2);
  assert.equal(w.planActorRoute(other,a,d)?.minutes,7);
  const shortcut=w.room('new_arched_way','Новый публичный ход');
  w.connect(a,shortcut,{travelMinutes:1});
  w.connect(shortcut,d,{travelMinutes:1});
  assert.equal(w.planActorRoute(other,a,d)?.minutes,2);
  assert.deepEqual(w.planActorRoute(other,a,d)?.rooms,[a,shortcut,d]);
  assert.equal(w.planActorRoute(pupil,a,d)?.hops,1);
});
