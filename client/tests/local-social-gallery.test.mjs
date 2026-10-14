import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLivingRoom} from '../src/living-room.js';
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
 assert.equal(talk.dialogue.source,'conversation');
 assert.match(talk.dialogue.answer,/Хогвартсе/);
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
 assert.equal(testimony.dialogue.answered,true);
 assert.match(testimony.dialogue.answer,/ты/);
 assert.ok(game.snapshot().player.journal.some(x=>x.includes('Со слов Лили')));
 const james=game.submit({type:'ask_cup',listener:'james'});
 assert.equal(james.ok,true);
 assert.equal(james.dialogue.answered,true);
 assert.equal(JSON.stringify(game.snapshot()).includes('beliefsByCharacter'),false);
});
test('G3 world expansion: the actual gallery_4 graph node can be explored',()=>{
 assert.equal(graph.gallery.key,'gallery_4');
 assert.ok(graph.links.some(([a,b])=>[a,b].includes(graph.gallery.key)&&
   [a,b].includes(graph.landing.key)));
 const game=createLivingRoom(graph,{warmupTicks:0});
 assert.ok(!game.snapshot().player.knownRooms.includes(graph.gallery.key));
 walkTo(game,{x:0,z:7.9});
 assert.equal(game.submit({type:'move',destination:graph.landing.key}).ok,true);
 assert.equal(game.snapshot().nearbyPeople.length,0);
 assert.equal(game.submit({type:'survey_gallery'}).reason,'not_in_reach');
 assert.equal(game.submit({type:'move',destination:graph.gallery.key}).reason,
   'unknown_destination');
 walkTo(game,{x:0,z:3.85});
 assert.equal(game.submit({type:'survey_gallery'}).ok,true);
 assert.ok(game.snapshot().player.knownRooms.includes(graph.gallery.key));
 assert.equal(game.submit({type:'move',destination:graph.gallery.key}).ok,true);
 assert.equal(game.snapshot().player.room,'gallery_4');
 assert.ok(game.snapshot().player.visited.includes('gallery_4'));
 assert.equal(game.snapshot().nearbyPeople.length,0);
 assert.equal(game.submit({type:'talk',listener:'lily',topic:'castle'}).ok,false);
 assert.equal(game.submit({type:'move',destination:graph.landing.key}).ok,true);
});