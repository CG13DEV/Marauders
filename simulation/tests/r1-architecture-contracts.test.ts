import test from 'node:test';
import assert from 'node:assert/strict';
import {personallyAvoids, type CommitmentMemory} from '../src/core/social-commitments.ts';
import {chooseSocialResponse} from '../src/core/social-choice.ts';

const memory=(kind:CommitmentMemory['kind'],minute:number):CommitmentMemory=>({
  kind,minute,meetingId:minute,partner:7,room:2,purpose:'explore'
});
test('R1 A1: proposal, invitation, acceptance or refusal are not reconciliation',()=>{
  for(const kind of ['offered','invited','accepted','declined','promised','heard_promise']
    as const){
    assert.equal(personallyAvoids([memory('waited_alone',560),memory(kind,570)],7),
      true,kind);
  }
  assert.equal(personallyAvoids([memory('waited_alone',560),memory('met',600)],7),false);
  assert.equal(personallyAvoids([memory('met',600),memory('waited_alone',650)],7),true);
  assert.equal(personallyAvoids([memory('waited_alone',560)],8),false);
});

test('R1 A2: a nearby unavailable person still motivates physical avoidance',()=>{
  const input={
    actor:3,minute:570,history:[memory('waited_alone',560)],
    trust:()=> 'neutral' as const,knownExits:[15,10],
    people:[],nearbyPeople:[7]
  };
  assert.deepEqual(chooseSocialResponse(input),
    {kind:'leave',destination:10,reason:'avoidance'});
  assert.deepEqual(chooseSocialResponse({...input,nearbyPeople:[]}),
    {kind:'idle',reason:'no_opportunity'});
  assert.deepEqual(chooseSocialResponse({...input,nearbyPeople:[7,8],people:[8]}),
    {kind:'chat',listener:8,reason:'other_company'});
});
