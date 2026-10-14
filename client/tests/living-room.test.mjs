import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLivingRoom,LIVING_ACTORS} from '../src/living-room.js';

const graph=JSON.parse(await readFile(new URL('../src/tower-graph.generated.json',
  import.meta.url),'utf8'));

test('RB-4: four independently simulated pupils occupy real Gryffindor nodes',()=>{
  const live=createLivingRoom(graph);
  const state=live.snapshot();
  assert.equal(state.tick,67);
  assert.equal(state.locations.length,4);
  assert.deepEqual(new Set(state.locations.map(x=>x[0])),
    new Set(LIVING_ACTORS.map(x=>x.key)));
  const keys=new Set([graph.common,graph.landing,
    ...graph.research,...graph.legacy].map(x=>x.key));
  for(const [,room] of state.locations)assert.ok(keys.has(room));
  assert.equal(JSON.stringify(state).includes('beliefs'),false);
});

test('RB-4: only real ECS decisions generate observable movement and social events',()=>{
  const live=createLivingRoom(graph);
  const before=live.snapshot();
  for(let i=0;i<200;i++)live.snapshot();
  assert.deepEqual(live.snapshot(),before);
  const links=new Set(graph.links.flatMap(([a,b])=>[a+'|'+b,b+'|'+a]));
  let moves=0,activity=0;
  for(let i=0;i<170;i++){
    const prior=live.snapshot();
    const {delta,activity:latest,snapshot}=live.advance();
    assert.equal(snapshot.tick,prior.tick+1);
    assert.equal(delta.sequence,prior.sequence+1);
    assert.equal(snapshot.locations.length,4);
    for(const move of delta.movements){
      moves++;
      assert.ok(links.has(move.from+'|'+move.to),
        'Movement uses a real graph edge: '+JSON.stringify(move));
    }
    activity+=latest.length;
  }
  assert.ok(moves>0,'No autonomous ECS movement observed');
  assert.ok(activity>0,'No locally observed social events');
});

test('RB-4: separate simulations produce identical public events',()=>{
  const a=createLivingRoom(graph),b=createLivingRoom(graph);
  assert.deepEqual(a.snapshot(),b.snapshot());
  for(let i=0;i<35;i++)assert.deepEqual(a.advance(),b.advance());
});

test('RB-5.2: autonomous travel progress comes from seconds, not browser frames',()=>{
  const live=createLivingRoom(graph,{warmupTicks:0});
  assert.equal(live.snapshot().worldSeconds,0);
  const beginning=live.advance();
  assert.equal(beginning.snapshot.tick,1);
  assert.equal(beginning.snapshot.worldSeconds,600);
  assert.ok(beginning.snapshot.journeys.length>0,
    'Autonomous breakfast travel must create active ECS journeys');
  for(const journey of beginning.snapshot.journeys){
    assert.equal(journey.progress,0);
    assert.equal(journey.remainingSeconds,120);
  }
  const still=live.snapshot();
  for(let i=0;i<150;i++)live.snapshot();
  assert.deepEqual(live.snapshot(),still);
  const part=live.advanceSeconds(60);
  assert.equal(part.snapshot.tick,1,'no scheduler step during sub-tick travel');
  assert.equal(part.snapshot.worldSeconds,660);
  assert.ok(part.snapshot.journeys.every(j=>j.progress===0.5));
  assert.equal(part.delta.movements.length,0,'cannot move ECS occupancy before arrival');
  const almost=live.advanceSeconds(59);
  assert.equal(almost.delta.movements.length,0);
  const arrive=live.advanceSeconds(1);
  assert.equal(arrive.snapshot.worldSeconds,720);
  assert.ok(arrive.delta.movements.length>0,
    'validated arrival must publish observer deltas at authoritative second');
  assert.equal(arrive.snapshot.journeys.length,0);
  assert.equal(arrive.snapshot.tick,1);
});

test('RB-5.2: variable polling cadence yields the same authoritative world',()=>{
  const a=createLivingRoom(graph,{warmupTicks:0});
  const b=createLivingRoom(graph,{warmupTicks:0});
  a.advanceSeconds(1200);
  for(let i=0;i<120;i++)b.advanceSeconds(10);
  const s1=a.snapshot(),s2=b.snapshot();
  assert.equal(s1.worldSeconds,s2.worldSeconds);
  assert.equal(s1.tick,s2.tick);
  assert.deepEqual(s1.locations,s2.locations);
  assert.deepEqual(s1.journeys,s2.journeys);
  assert.deepEqual(s1.recent,s2.recent);
});
