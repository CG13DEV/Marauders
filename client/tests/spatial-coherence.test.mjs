import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {bedroomPlan,validateBedroomPlan,bedOverlap}
  from '../src/layout-bedroom.js';
import {commonPlan,validateCommonPlan} from '../src/layout-common.js';
import {landingPlan,validateLandingPlan,LANDING_BOUNDS}
  from '../src/layout-landing.js';
import {walkable,safeSpawn} from '../src/movement.js';
import {slotsFor,roomAnchor,signedAngle}
  from '../src/architecture.js';

const manifest=JSON.parse(await readFile(new URL(
  '../src/tower-graph.generated.json',import.meta.url),'utf8'));

test('T4.1-T4.2 all 39 dorm nodes fit true resident counts into a 5-slot arc',()=>{
  assert.equal(manifest.research.length,37);
  assert.equal(manifest.legacy.length,2);
  for(const room of [...manifest.research,...manifest.legacy]){
    const n=room.type==='legacy'?0:room.students;
    const plan=bedroomPlan({students:n});
    assert.equal(validateBedroomPlan(plan),true,room.key);
    assert.equal(plan.beds.length,room.capacity);
    assert.equal(plan.beds.filter(p=>p.occupied).length,n);
    assert.ok(plan.beds.every(p=>Math.hypot(p.center.x,p.center.z)>5));
    assert.ok(plan.beds.every(p=>Math.hypot(p.trunk.x,p.trunk.z)>3.5));
    for(let i=0;i<plan.beds.length;i++)
      for(let j=i+1;j<plan.beds.length;j++)
        assert.equal(bedOverlap(plan.beds[i],plan.beds[j]),false,
          room.key+' overlapping beds '+i+'/'+j);
    for(const window of slotsFor('bedroom').filter(s=>s.type==='window'))
      for(const bed of plan.beds)
        assert.ok(Math.abs(signedAngle(bed.angle,window.angle))>.32);
    assert.ok(plan.beds.every(p=>
      Math.hypot(p.center.x,p.center.z)-p.length/2>
        plan.centerClearance));
  }
});
test('T4.2 visible bed count is occupancy, not full capacity',()=>{
  for(const n of [0,1,2,3,4,5]){
    const plan=bedroomPlan({students:n});
    assert.equal(plan.beds.filter(b=>b.occupied).length,n);
    assert.equal(validateBedroomPlan(plan),true);
  }
  assert.throws(()=>bedroomPlan({students:6}),/occupancy/);
  assert.throws(()=>bedroomPlan({students:-1}),/occupancy/);
});
test('T4.4 the common room leaves central walking and three portals clear',()=>{
  const plan=commonPlan();
  assert.equal(validateCommonPlan(plan),true);
  assert.equal(plan.approaches.length,4);
  assert.equal(plan.windowSeats.length,2);
  const objects=[
    ...plan.couches.map(p=>({...p,r:1.18})),
    ...plan.sideTables.map(p=>({...p,r:.6})),
    ...plan.writingDesks.map(p=>({...p,r:.85})),
    ...plan.windowSeats.map(p=>({...p,r:.64}))
  ];
  for(const p of plan.approaches)
    assert.ok(!objects.some(o=>Math.hypot(o.x-p.x,o.z-p.z)<o.r+.55),
      'Blocked portal '+p.id);
  // Sanity: actual graph has one portrait and two stairs; not four doors.
  assert.equal(slotsFor('common').filter(s=>s.portal).length,3);
});
test('T4.3 portrait landing is a RECTANGULAR corridor with real approach',()=>{
  const plan=landingPlan();
  assert.equal(validateLandingPlan(plan),true);
  assert.ok(plan.length>plan.width);
  assert.deepEqual(plan.bounds,LANDING_BOUNDS);
  assert.equal(slotsFor('landing').filter(s=>s.type==='portrait').length,1);
  assert.equal(slotsFor('landing').filter(s=>s.type==='window').length,2);
  for(const window of slotsFor('landing').filter(s=>s.type==='window')){
    assert.ok(Math.abs(Math.abs(window.angle)-Math.PI/2)<1e-8);
    assert.ok(Math.abs(roomAnchor(3.45,window.angle).x)>3.44);
  }
  const stage={radius:7.4,bounds:plan.bounds,obstacles:[]};
  assert.equal(walkable(stage,0,-3.1),true);
  assert.equal(walkable(stage,0,3.8),true);
  assert.equal(walkable(stage,4,0),false);
  assert.equal(walkable(stage,0,6),false);
  assert.deepEqual(safeSpawn(stage,{x:0,z:1}),{x:0,z:1});
});
