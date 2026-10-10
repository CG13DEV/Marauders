import test from 'node:test';
import assert from 'node:assert/strict';
import {wallFrame,onCameraSide} from '../src/wall-geometry.js';
import {keyForControl} from '../src/movement.js';

test('every circular stone segment is tangential, not a radial fence',()=>{
  const n=48,r=10,arc=Math.PI*2*r/n;
  for(let i=0;i<n;i++){
    const f=wallFrame(i,n,r);
    const tangentX=Math.sin(f.rotation);
    const tangentZ=Math.cos(f.rotation);
    const radialDot=tangentX*f.normalX+tangentZ*f.normalZ;
    assert.ok(Math.abs(radialDot)<1e-10,
      'segment '+i+' has a radial long side');
    assert.ok(Math.abs(Math.hypot(f.x,f.z)-r)<1e-9);
    const next=wallFrame((i+1)%n,n,r);
    const chord=Math.hypot(next.x-f.x,next.z-f.z);
    assert.ok(chord<arc);
    assert.ok(chord>arc*.99);
  }
});
test('cutaway always turns toward viewer when camera rotates',()=>{
  const n=48,r=10;
  for(const yaw of [0,Math.PI/4,Math.PI/2,Math.PI,5.2]){
    const frames=Array.from({length:n},(_,i)=>wallFrame(i,n,r));
    const close=frames.filter(f=>onCameraSide(f,yaw));
    assert.ok(close.length>=20&&close.length<=25);
    const far=frames.filter(f=>onCameraSide(f,yaw+Math.PI));
    for(const f of close)assert.ok(!far.includes(f));
  }
});
test('WASD / QEF use physical keys even with Cyrillic keyboard layout',()=>{
  assert.equal(keyForControl({code:'KeyW',key:'ц'}),'w');
  assert.equal(keyForControl({code:'KeyA',key:'ф'}),'a');
  assert.equal(keyForControl({code:'KeyS',key:'ы'}),'s');
  assert.equal(keyForControl({code:'KeyD',key:'в'}),'d');
  assert.equal(keyForControl({code:'KeyQ',key:'й'}),'q');
  assert.equal(keyForControl({code:'KeyE',key:'у'}),'e');
  assert.equal(keyForControl({code:'KeyF',key:'а'}),'f');
  assert.equal(keyForControl({code:'ArrowUp',key:'ArrowUp'}),'arrowup');
  assert.equal(keyForControl({code:'Backspace',key:'Backspace'}),null);
});
