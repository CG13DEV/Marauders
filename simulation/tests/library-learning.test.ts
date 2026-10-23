import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseLocalStudyBook} from '../src/core/library-learning.ts';

test('local cover hints are sufficient; unknown titles never reveal contents',()=>{
  assert.equal(chooseLocalStudyBook('lumos',[
    {id:8,label:'Levitation Handbook'},
    {id:4,label:'Lumos — чароведение'},
    {id:3,label:'LUMOS: практика'}
  ]),3);
  assert.equal(chooseLocalStudyBook('lumos',[{id:7,label:'Записки о свете'}]),null);
  assert.equal(chooseLocalStudyBook('lumos',[]),null);
});
