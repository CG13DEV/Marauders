import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/Simulation.ts';
import {arbitrateAutonomousAction} from '../src/core/action-arbitration.ts';

function fork(people:boolean,manual=false){
  const world=createSimulation();
  const room=world.room('gallery','Галерея');
  const actor=world.character('actor','Ученик',room);
  const friend=people?world.character('friend','Друг',room):null;
  const vase=world.fragileObject('vase','Ваза',room);
  // Place the next choice at evening leisure, without an earlier scripted act.
  for(let i=0;i<65;i++)world.step(); 
  const plan={homeRoom:room,diningRoom:room,leisureRoom:room,
    style:'reserved' as const,interest:'castle' as const};
  world.setDailyLife(actor,{...plan,mischief:'reckless',socialChoice:'reflective'});
  if(friend!==null)world.setDailyLife(friend,plan);
  if(manual)world.setManualControl(actor,true);
  const decisions=world.step().filter(d=>d.actor===actor);
  return {
    decisions:decisions.map(d=>d.action.type),
    broken:world.isBroken(vase),
    chat:world.conversationHistory(actor).map(x=>x.partner===friend?'friend':'other'),
    clock:world.clock().absoluteMinute
  };
}
test('R3: social contact wins over vandalism when both candidates exist',()=>{
  const both=fork(true);
  assert.equal(both.clock,1140);
  assert.deepEqual(both.decisions,['chat']);
  assert.deepEqual(both.chat,['friend']);
  assert.equal(both.broken,false);
});
test('R3: if no social opportunity exists, autonomous object interaction remains',()=>{
  const alone=fork(false);
  assert.deepEqual(alone.decisions,['break_object']);
  assert.equal(alone.broken,true);
});
test('R3: manual control cannot be hijacked by either candidate',()=>{
  const manual=fork(true,true);
  assert.deepEqual(manual.decisions,[]);
  assert.equal(manual.broken,false);
});
test('R3: deterministic pure arbitration, including idle social policies',()=>{
  const chat={kind:'chat' as const,listener:5,reason:'habit' as const};
  assert.deepEqual(arbitrateAutonomousAction({social:chat,mischiefTarget:10}),
    {kind:'social',response:chat});
  assert.deepEqual(arbitrateAutonomousAction({
    social:{kind:'idle',reason:'no_opportunity'},mischiefTarget:10
  }),{kind:'mischief',target:10});
  assert.equal(arbitrateAutonomousAction({mischiefTarget:null}),null);
  assert.deepEqual(fork(true),fork(true));
});
