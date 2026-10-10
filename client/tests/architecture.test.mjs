import test from 'node:test';
import assert from 'node:assert/strict';
import {slotsFor,validateSlots,slotAt,roomAnchor,signedAngle}
  from '../src/architecture.js';
import {wallFrame} from '../src/wall-geometry.js';
test('real wall slots cannot intersect or cover one another',()=>{
  for(const [kind,radius] of [['common',10],['landing',7.4],['bedroom',7.6]]){
    const slots=slotsFor(kind);
    assert.equal(validateSlots(slots,radius),true);
    const walls=Array.from({length:48},(_,i)=>wallFrame(i,48,radius));
    assert.ok(walls.some(w=>slotAt(w.angle,slots,radius)===null));
    for(const slot of slots){
      assert.equal(slotAt(slot.angle,slots,radius),slot);
      assert.ok(walls.some(w=>slotAt(w.angle,slots,radius)?.id===slot.id),
        'no actual gap for '+slot.id);
    }
  }
});
test('Gryffindor shell has portrait + two stairs + two windows + hearth',()=>{
  const slots=slotsFor('common');
  assert.deepEqual(slots.map(s=>s.type).sort(),
    ['portrait','stair','stair','window','window','fireplace'].sort());
  const girl=slots.find(s=>s.id==='girls');
  const boy=slots.find(s=>s.id==='boys');
  const portrait=slots.find(s=>s.id==='portrait');
  const fire=slots.find(s=>s.id==='fireplace');
  assert.ok(roomAnchor(10,boy.angle).x<0);
  assert.ok(roomAnchor(10,girl.angle).x>0);
  assert.ok(roomAnchor(10,portrait.angle).z>0);
  assert.ok(roomAnchor(10,fire.angle).z<0);
  for(const s of [boy,girl,portrait]){
    const foot=roomAnchor(10,s.angle,2.08);
    assert.ok(Math.hypot(foot.x,foot.z)<10-1.15);
  }
  assert.equal(slots.filter(s=>s.portal==='wing').length,2);
});
test('window normals rotate with curved wall instead of using world axes',()=>{
  const slots=slotsFor('common');
  for(const win of slots.filter(s=>s.type==='window')){
    const p=roomAnchor(10,win.angle);
    const inward={x:-p.x/10,z:-p.z/10};
    const rotation=win.angle+Math.PI/2;
    assert.ok(Math.abs(Math.cos(rotation)-inward.x)<1e-10);
    assert.ok(Math.abs(-Math.sin(rotation)-inward.z)<1e-10);
    assert.ok(Math.abs(signedAngle(win.angle,Math.PI))>.2);
  }
});
test('unknown architectural rooms are rejected',()=>{
  assert.throws(()=>slotsFor('invented'));
  assert.throws(()=>validateSlots([{id:'a',angle:0,width:3},
    {id:'b',angle:0,width:2}],10),/Overlapping/);
});
