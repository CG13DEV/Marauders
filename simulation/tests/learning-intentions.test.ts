import test from 'node:test';
import assert from 'node:assert/strict';
import { planStudyIntention } from '../src/core/learning-intentions.ts';

const base={
  learner:1,gaps:['lumos' as const],room:9,minute:1150,
  attempted:new Set<string>(),
  memories:[],
  trust:(_id:number)=>'neutral' as const,
  available:(_id:number)=>true
};

test('a personal knowledge gap is necessary for a learning intention',()=>{
  assert.equal(planStudyIntention({...base,gaps:[],candidates:[2]}),null);
});

test('planner reads only present candidates and does not inspect hidden knowledge',()=>{
  const result=planStudyIntention({...base,candidates:[4,3,2]});
  assert.deepEqual(result,{
    kind:'learn_concept',spell:'lumos',helper:2,room:9,atMinute:2620
  });
});

test('a remembered absence or recorded failed helper changes next choice',()=>{
  const memories=[{
    meetingId:1,partner:2,kind:'waited_alone' as const,
    minute:1000,room:9,purpose:'study' as const,spell:'lumos' as const
  }];
  const result=planStudyIntention({...base,candidates:[2,3,4],memories,
    attempted:new Set(['3:lumos'])});
  assert.equal(result?.helper,4);
  assert.equal(planStudyIntention({...base,candidates:[2],
    memories,available:()=>false}),null);
});

test('learning appointment cannot target an inaccessible or distrusted partner',()=>{
  assert.equal(planStudyIntention({...base,candidates:[3],
    trust:()=> 'distrusted' as const}),null);
  assert.equal(planStudyIntention({...base,candidates:[3],
    available:()=>false}),null);
});
