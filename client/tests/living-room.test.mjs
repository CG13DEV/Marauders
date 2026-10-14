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
