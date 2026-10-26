import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/Simulation.ts';
import {createStarterSchool} from '../src/cli/text-game.ts';
import {scenePerspective,npcPerspective} from '../src/narrative/perspective.ts';
import {NarrativeBridge} from '../src/narrative/bridge.ts';
import {
  MockNarrativeProvider,OpenAINarrativeProvider,type NarrativeRequest
} from '../src/narrative/provider.ts';

function colocatedStarter(){
  const world=createStarterSchool();
  const james=world.id('james')!;
  const lily=world.id('lily')!;
  assert.equal(world.execute({type:'move',actor:james,destination:world.id('corridor')!}).ok,true);
  assert.equal(world.execute({type:'move',actor:james,destination:world.id('classroom')!}).ok,true);
  return {world,james,lily};
}

test('NPC perspective contains her own knowledge and directed attitude, not third-party mastery',()=>{
  const {world,james,lily}=colocatedStarter();
  const remus=world.id('remus')!;
  world.seedSpellKnowledge(lily,'lumos','conceptual');
  world.seedSpellKnowledge(remus,'wingardium_leviosa','independent');
  world.setTrust(lily,james,'distrusted');
  const view=npcPerspective(world,lily,james,'[GAME] Любознательная');
  assert.equal(view.relationshipToPlayer.trust,'distrusted');
  assert.equal(view.authoredPersonality,'[GAME] Любознательная');
  assert.equal(view.magicKnowledge.find(k=>k.spell==='lumos')?.stage,'conceptual');
  assert.equal(view.magicKnowledge.find(k=>k.spell==='wingardium_leviosa')?.stage,'unaware');
  assert.equal(view.recentLearning.some(entry=>entry.spell==='wingardium_leviosa'),false);
  assert.equal(view.personalBeliefs.length,0);
});

test('Scene perception does not reveal visually inaccessible characters and books',()=>{
  const world=createSimulation();
  const room=world.room('room','Тёмная комната');
  const blind=world.character('blind','Слепой ученик',room,{vision:false});
  world.character('secret','Сосед',room);
  world.spellBook('book','Личная книга',room,'lumos');
  const view=scenePerspective(world,blind);
  assert.deepEqual(view.people,[]);
  assert.deepEqual(view.books,[]);
  assert.deepEqual(view.magic,[]);
  assert.equal(view.senses.vision,false);
});

test('Dialogue refuses remote or inaudible NPC without querying provider',async()=>{
  const world=createStarterSchool();
  const provider=new MockNarrativeProvider();
  const bridge=new NarrativeBridge(provider);
  await assert.rejects(bridge.talk(world,world.id('james')!,world.id('lily')!,'Привет'),
    /co-located/);
  assert.equal(provider.requests.length,0);
  const room=world.id('common_room')!;
  const deaf=world.character('deaf','Глухой ученик',room,{hearing:false});
  await assert.rejects(bridge.talk(world,world.id('james')!,deaf,'Привет'),
    /hear/);
  assert.equal(provider.requests.length,0);
});

test('Narrative scene and free dialogue never change authoritative world',async()=>{
  const {world,james,lily}=colocatedStarter();
  const before=JSON.stringify(world.captureRuntime());
  const provider=new MockNarrativeProvider();
  const bridge=new NarrativeBridge(provider);
  assert.match(await bridge.scene(world,james),/mock/);
  assert.match(await bridge.talk(world,james,lily,'Сможешь научить меня?'),/mock/);
  assert.equal(JSON.stringify(world.captureRuntime()),before);
  assert.equal(provider.requests.length,2);
  assert.equal(provider.requests[0]?.kind,'scene');
  assert.equal(provider.requests[1]?.kind,'dialogue');
  assert.equal(provider.requests[1]?.input.includes('events'),false);
});

test('Conversation history is bounded and never turns previous model speech into world facts',async()=>{
  const {world,james,lily}=colocatedStarter();
  const provider=new MockNarrativeProvider();
  const bridge=new NarrativeBridge(provider);
  for(let i=0;i<7;i++)await bridge.talk(world,james,lily,'Как поживаешь '+i+'?');
  const last=JSON.parse(provider.requests.at(-1)!.input) as {
    history:Array<{speaker:string;text:string}>, perspective:object
  };
  assert.ok(last.history.length<=6);
  assert.equal(last.history.at(-1)?.speaker,'npc');
  assert.equal(world.conversationHistory(lily).length,0);
  assert.ok(last.perspective);
});

test('OpenAI adapter sends server-only bounded Responses API requests, with storage disabled',async()=>{
  const requests:Array<{url:string;body:Record<string,unknown>;headers:Headers}>=[];
  const fetchImpl:typeof fetch=async(input,init)=>{
    requests.push({
      url:String(input),
      body:JSON.parse(String(init?.body)) as Record<string,unknown>,
      headers:new Headers(init?.headers)
    });
    return new Response(JSON.stringify({status:'completed',output:[
      {type:'message',content:[{type:'output_text',text:'Привет, Ремус!'}]}
    ]}),{status:200});
  };
  const provider=new OpenAINarrativeProvider({apiKey:'unit-test-key',fetchImpl});
  const result=await provider.generate({
    kind:'dialogue',instructions:'Reply safely',input:'Hello'
  });
  assert.equal(result,'Привет, Ремус!');
  assert.equal(requests.length,1);
  assert.equal(requests[0]!.url,'https://api.openai.com/v1/responses');
  assert.equal(requests[0]!.headers.get('Authorization'),'Bearer unit-test-key');
  assert.equal(requests[0]!.body.model,'gpt-6-luna');
  assert.deepEqual(requests[0]!.body.reasoning,{effort:'low'});
  assert.equal(requests[0]!.body.store,false);
  assert.equal(requests[0]!.body.max_output_tokens,500);
});

test('OpenAI adapter rejects incomplete output and hides upstream error bodies',async()=>{
  const a=new OpenAINarrativeProvider({apiKey:'x',fetchImpl:async()=>
    new Response(JSON.stringify({status:'incomplete',output:[]}),{status:200})});
  await assert.rejects(a.generate({kind:'scene',instructions:'a',input:'{}'}),/incomplete/);
  const b=new OpenAINarrativeProvider({apiKey:'x',fetchImpl:async()=>
    new Response('sensitive upstream payload',{status:429})});
  await assert.rejects(b.generate({kind:'scene',instructions:'a',input:'{}'}),error=>{
    assert.ok(error instanceof Error);
    assert.match(error.message,/HTTP 429/);
    assert.doesNotMatch(error.message,/sensitive/);
    return true;
  });
});
