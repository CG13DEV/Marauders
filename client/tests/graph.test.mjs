import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const path=resolve(dirname(fileURLToPath(import.meta.url)),
  '../src/tower-graph.generated.json');
const graph=JSON.parse(await readFile(path,'utf8'));
const adjacency=new Map();
for(const [a,b] of graph.links){
  if(!adjacency.has(a))adjacency.set(a,[]);
  if(!adjacency.has(b))adjacency.set(b,[]);
  adjacency.get(a).push(b);adjacency.get(b).push(a);
}
test('all research-600 Gryffindor physical dorm nodes are represented',()=>{
  assert.equal(graph.totals.bedrooms,40);
  assert.equal(graph.research.length,38);
  assert.equal(graph.legacy.length,2);
  assert.equal(graph.totals.pupils,150);
  const names=[graph.common.key,graph.landing.key,
    ...graph.research.map(x=>x.key),...graph.legacy.map(x=>x.key)];
  assert.equal(new Set(names).size,names.length);
  assert.equal(graph.research.every(r=>r.capacity===5 &&
    r.students>0 && r.students<=5),true);
});
test('seven year cohorts, two wings, no invented bedroom-to-bedroom edges',()=>{
  for(let year=1;year<=7;year++)
    for(const wing of ['boys','girls'])
      assert.ok(graph.research.some(r=>r.year===year&&r.wing===wing),
        'missing '+year+' '+wing);
  for(const room of [...graph.research,...graph.legacy])
    assert.deepEqual(adjacency.get(room.key),[graph.common.key],
      'room adjacency drift: '+room.key);
  assert.deepEqual(new Set(adjacency.get(graph.common.key)),
    new Set([graph.landing.key,...graph.research.map(r=>r.key),
      ...graph.legacy.map(r=>r.key)]));
  assert.ok(adjacency.get(graph.landing.key).includes(graph.common.key));
});
test('bed assignments are actual generated research classroom residents',()=>{
  const distribution=new Map();
  for(const r of graph.research){
    const key=r.year+':'+r.wing;
    distribution.set(key,(distribution.get(key)??0)+r.students);
  }
  for(let year=1;year<=7;year++){
    const count=[22,20,23,21,22,20,22][year-1];
    assert.equal(distribution.get(year+':boys'),Math.ceil(count/2));
    assert.equal(distribution.get(year+':girls'),Math.floor(count/2));
  }
});
