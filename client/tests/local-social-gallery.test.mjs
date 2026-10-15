import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLivingRoom,TIMED_PLAYER_ACTION_SECONDS} from '../src/living-room.js';
const graph=JSON.parse(await readFile(new URL('../src/tower-graph.generated.json',
 import.meta.url),'utf8'));
function walkTo(game,target){
 for(let i=0;i<145;i++){
  const p=game.snapshot().player.position;
  const dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz);
  if(d<.055)return;
  const step=Math.min(.14,d);
  const r=game.submit({type:'walk',dx:dx/d*step,dz:dz/d*step});
  assert.equal(r.ok,true,'blocked at '+JSON.stringify(p));
 }
 assert.fail('Unreachable player test position');
}
test('G3: speaking requires reach, a real target and valid topic',()=>{
 const game=createLivingRoom(graph,{warmupTicks:0});
 assert.equal(game.submit({type:'talk',listener:'lily',topic:'castle'}).reason,'not_in_reach');
 assert.equal(game.submit({type:'ask_cup',listener:'missing'}).reason,'not_visible');
 walkTo(game,{x:0,z:1.5});
 assert.equal(game.snapshot().nearbyPeople.find(n=>n.key==='lily')?.canTalk,true);
 assert.equal(game.submit({type:'talk',listener:'lily',topic:'gossip'}).reason,'wrong_topic');
 const talk=game.submit({type:'talk',listener:'lily',topic:'castle'});
 assert.equal(talk.ok,true);
 assert.equal(talk.started,true);
 assert.equal(game.snapshot().player.interaction.remainingSeconds,
   TIMED_PLAYER_ACTION_SECONDS.talk);
 assert.equal(game.snapshot().player.lastInteraction,null,
   'Social truth is committed only after world-time completion');
 assert.equal(game.submit({type:'talk',listener:'lily',topic:'castle'}).reason,'busy');
 game.advanceSeconds(TIMED_PLAYER_ACTION_SECONDS.talk-1);
 assert.equal(game.snapshot().player.lastInteraction,null);
 game.advanceSeconds(1);
 assert.equal(game.snapshot().player.interaction,null);
 assert.equal(game.snapshot().player.lastInteraction.status,'completed');
 assert.equal(game.snapshot().player.lastInteraction.dialogue.source,'conversation');
 assert.match(game.snapshot().player.lastInteraction.dialogue.answer,/Хогвартсе/);
 assert.equal(game.submit({type:'talk',listener:'lily',topic:'castle'}).reason,'already_chatted');
 assert.equal(game.submit({type:'talk',listener:'james',topic:'castle',actor:99}).ok,false);
});
test('G3: cup questioning uses participant-owned evidence, not global event log',()=>{
 const game=createLivingRoom(graph,{warmupTicks:0});
 walkTo(game,{x:0,z:1.5});
 assert.equal(game.submit({type:'ask_cup',listener:'lily'}).reason,'not_known');
 assert.equal(game.submit({type:'break_cup'}).ok,true);
 // The player personally WITNESSED the breakage and already has grounded
 // evidence: the model must not require a redundant inspection.
 const testimony=game.submit({type:'ask_cup',listener:'lily'});
 assert.equal(testimony.ok,true);
 assert.equal(testimony.started,true);
 game.advanceSeconds(TIMED_PLAYER_ACTION_SECONDS.ask_cup);
 assert.equal(game.snapshot().player.lastInteraction.status,'completed');
 assert.equal(game.snapshot().player.lastInteraction.dialogue.answered,true);
 assert.match(game.snapshot().player.lastInteraction.dialogue.answer,/ты/);
 assert.ok(game.snapshot().player.journal.some(x=>x.includes('Со слов Лили')));
 assert.equal(JSON.stringify(game.snapshot()).includes('beliefsByCharacter'),false);
});
test('G3 world expansion: the actual gallery_4 graph node can be explored',()=>{
 assert.equal(graph.gallery.key,'gallery_4');
 assert.ok(graph.links.some(([a,b])=>[a,b].includes(graph.gallery.key)&&
   [a,b].includes(graph.landing.key)));
 const game=createLivingRoom(graph,{warmupTicks:0});
 assert.ok(!game.snapshot().player.knownRooms.includes(graph.gallery.key));
 walkTo(game,{x:0,z:12.65});
 assert.equal(game.submit({type:'move',destination:graph.landing.key}).ok,true);
 assert.equal(game.snapshot().nearbyPeople.length,0);
 assert.equal(game.submit({type:'survey_gallery'}).reason,'not_in_reach');
 assert.equal(game.submit({type:'move',destination:graph.gallery.key}).reason,
   'unknown_destination');
 walkTo(game,{x:0,z:-4.40});
 assert.equal(game.submit({type:'survey_gallery'}).ok,true);
 assert.ok(game.snapshot().player.knownRooms.includes(graph.gallery.key));
 assert.equal(game.submit({type:'move',destination:graph.gallery.key}).ok,true);
 assert.equal(game.snapshot().player.room,'gallery_4');
 assert.ok(game.snapshot().player.visited.includes('gallery_4'));
 assert.equal(game.snapshot().nearbyPeople.length,0);
 assert.equal(game.submit({type:'talk',listener:'lily',topic:'castle'}).ok,false);
 assert.equal(game.submit({type:'move',destination:graph.landing.key}).ok,true);
});
test('G3.3: cancelling an occupied social action never invents an ECS conversation',()=>{
 const game=createLivingRoom(graph,{warmupTicks:0});
 walkTo(game,{x:0,z:1.5});
 assert.equal(game.submit({type:'cancel_interaction'}).reason,'no_active_interaction');
 const before=game.snapshot().worldSeconds;
 const started=game.submit({type:'talk',listener:'lily',topic:'lessons'});
 assert.equal(started.started,true);
 assert.equal(game.submit({type:'walk',dx:.1,dz:0}).reason,'busy');
 assert.equal(game.submit({type:'break_cup'}).reason,'busy');
 game.advanceSeconds(20);
 assert.equal(game.snapshot().player.interaction.remainingSeconds,
   TIMED_PLAYER_ACTION_SECONDS.talk-20);
 assert.equal(game.submit({type:'cancel_interaction'}).cancelled,true);
 assert.equal(game.snapshot().player.lastInteraction.status,'interrupted');
 assert.equal(game.snapshot().worldSeconds,before+20);
 assert.equal(game.submit({type:'talk',listener:'lily',topic:'castle'}).started,true,
   'Cancelled action must not consume once-per-day ECS chat');
 game.advanceSeconds(TIMED_PLAYER_ACTION_SECONDS.talk);
 assert.equal(game.snapshot().player.lastInteraction.status,'completed');
});

test('G3.3: splitting world advancement cannot change dialogue outcome',()=>{
 const single=createLivingRoom(graph,{warmupTicks:0});
 const split=createLivingRoom(graph,{warmupTicks:0});
 for(const game of [single,split]){
   walkTo(game,{x:0,z:1.5});
   assert.equal(game.submit({type:'talk',listener:'lily',topic:'hobbies'}).started,true);
 }
 single.advanceSeconds(TIMED_PLAYER_ACTION_SECONDS.talk);
 split.advanceSeconds(25);
 split.advanceSeconds(TIMED_PLAYER_ACTION_SECONDS.talk-25);
 const {sequence:singlePoll,...one}=single.snapshot();
 const {sequence:splitPoll,...two}=split.snapshot();
 assert.notEqual(singlePoll,splitPoll,'Observer packet counter is poll-dependent');
 assert.deepEqual(one,two,
   'Social outcome and world state must not depend on observer poll cadence');
});

test('G3.3 castle increment: a reachable gallery bench consumes world time',()=>{
 const game=createLivingRoom(graph,{warmupTicks:0});
 assert.equal(game.submit({type:'wait_gallery'}).reason,'not_in_reach');
 walkTo(game,{x:0,z:12.65});
 assert.equal(game.submit({type:'move',destination:graph.landing.key}).ok,true);
 walkTo(game,{x:0,z:-4.40});
 assert.equal(game.submit({type:'survey_gallery'}).ok,true);
 assert.equal(game.submit({type:'move',destination:graph.gallery.key}).ok,true);
 assert.equal(game.submit({type:'wait_gallery'}).reason,'not_in_reach');
 walkTo(game,{x:1.45,z:1.1});
 const clock=game.snapshot().worldSeconds;
 assert.equal(game.submit({type:'wait_gallery'}).started,true);
 assert.equal(game.submit({type:'move',destination:graph.landing.key}).reason,'busy');
 game.advanceSeconds(TIMED_PLAYER_ACTION_SECONDS.wait_gallery);
 assert.equal(game.snapshot().worldSeconds,clock+60);
 assert.equal(game.snapshot().player.lastInteraction.status,'completed');
 assert.ok(game.snapshot().player.journal.some(x=>x.includes('скамье')));
 assert.equal(game.snapshot().player.interaction,null);
});
