import test from 'node:test';
import assert from 'node:assert/strict';
import {paintFrame} from '../src/sprites.js';

function inspect(variant,view){
  const previous=globalThis.document;
  const canvas={width:0,height:0,ops:[],getContext(){
    return {fillStyle:'',imageSmoothingEnabled:false,
      fillRect(x,y,w,h){
        canvas.ops.push({x,y,w,h,color:this.fillStyle});
      }};
  }};
  globalThis.document={createElement(tag){
    assert.equal(tag,'canvas');return canvas;
  }};
  try{
    const frame=paintFrame(view,0,variant);
    assert.equal(frame.image,canvas);
    const at=(x,y)=>canvas.ops.filter(op=>x>=op.x&&x<op.x+op.w&&
      y>=op.y&&y<op.y+op.h).at(-1)?.color;
    frame.dispose();return at;
  }finally{globalThis.document=previous;}
}
test('Lily has a visible skin chin, green eyes and long ginger hair',()=>{
  const front=inspect('ginger',0);
  assert.equal(front(19,35),'#f4c7a0',
    'dark jaw silhouette must not look like a beard');
  assert.equal(front(19,26),'#388654','eyes should be green');
  assert.ok(['#b75e34','#e28c4f'].includes(front(12,40)),
    'long, highlighted ginger locks should reach shoulders');
  const back=inspect('ginger',4);
  assert.equal(back(14,42),'#b75e34',
    'long hair needs a distinct rear silhouette');
});
test('Other Marauder sprites retain their short-hair silhouette',()=>{
  const james=inspect('dark',0);
  assert.equal(james(19,35),'#211d25');
  assert.notEqual(james(19,26),'#388654');
});
