import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {MockNarrativeProvider} from '../src/narrative/provider.ts';
import {createNarrativeWebSession} from '../src/narrative/web-session.ts';
import {makeNarrativeHttpServer} from '../src/cli/narrative-web.ts';

test('Full text UI exposes context but not remote NPCs or global world events',()=>{
  const app=createNarrativeWebSession();
  const snapshot=app.state();
  assert.equal(snapshot.room.key,'common_room');
  assert.equal(snapshot.player,'Джеймс Поттер');
  assert.ok(snapshot.exits.some(e=>e.key==='corridor'));
  assert.ok(snapshot.people.some(p=>p.key==='peter'));
  assert.equal(snapshot.people.some(p=>p.key==='lily'),false);
  assert.equal(snapshot.skills.find(s=>s.key==='lumos')?.stage,'unaware');
  assert.ok(snapshot.lessons.some(l=>l.subject.includes('Чары')));
  assert.equal(JSON.stringify(snapshot).includes('entityKeys'),false);
  assert.equal(JSON.stringify(snapshot).includes('"events":'),false);
});

test('Mock story and NPC dialogue are deterministic and grounded in genuine lesson progress',async()=>{
  const provider=new MockNarrativeProvider();
  const app=createNarrativeWebSession({provider});
  await assert.rejects(app.dispatch({kind:'speak',target:'lily',text:'Люмос?'}),/рядом/);
  assert.equal(provider.requests.length,0);
  await app.dispatch({kind:'move',target:'corridor'});
  await app.dispatch({kind:'move',target:'classroom'});
  const first=await app.dispatch({kind:'speak',target:'lily',text:'Ты умеешь Люмос?'});
  assert.match(first,/пока не изучала/);
  const beforeStage=JSON.stringify(app.save());
  const scene=await app.dispatch({kind:'describe'});
  assert.match(scene,/Кабинет чар/);
  await app.dispatch({kind:'wait',ticks:2});
  const after=await app.dispatch({kind:'speak',target:'lily',text:'А сейчас Люмос?'});
  assert.match(after,/знаю теорию/);
  assert.notEqual(JSON.stringify(app.save()),beforeStage);
  const snapshot=app.state();
  assert.equal(snapshot.room.key,'classroom');
  assert.ok(snapshot.people.some(p=>p.key==='lily'));
  const prior=app.save();
  await app.dispatch({kind:'speak',target:'lily',text:'Покажи мне своё настроение'});
  assert.equal(app.save(),prior); // LLM/fixture dialogue cannot mutate ECS
});

test('Actions are explicit, validated, and checkpoint restores UI state',async()=>{
  const app=createNarrativeWebSession();
  const saved=app.save();
  await assert.rejects(app.dispatch({kind:'move',target:'library'}),/неизвестен/);
  await assert.rejects(app.dispatch({kind:'wait',ticks:999}),/от 1 до 12/);
  assert.equal(app.save(),saved);
  await app.dispatch({kind:'move',target:'corridor'});
  assert.equal(app.state().room.key,'corridor');
  app.load(saved);
  assert.equal(app.state().room.key,'common_room');
  assert.equal(app.save(),saved);
});

test('Local HTTP UI serves a real web shell, has no background LLM calls, and validates actions',async t=>{
  const provider=new MockNarrativeProvider();
  const app=createNarrativeWebSession({provider});
  const service=makeNarrativeHttpServer({app,port:0});
  const base=await service.listen();
  t.after(()=>new Promise<void>((resolve,reject)=>service.server.close(e=>e?reject(e):resolve())));
  const page=await fetch(base);
  assert.equal(page.status,200);
  assert.match(await page.text(),/Хогвартс/);
  assert.equal((await fetch(base+'narrative.js')).status,200);
  assert.equal((await fetch(base+'narrative.css')).status,200);
  const initial=await (await fetch(base+'api/state')).json() as {
    mode:string;room:{key:string};people:Array<{key:string}>
  };
  assert.equal(initial.mode,'mock');
  assert.equal(initial.room.key,'common_room');
  assert.equal(provider.requests.length,0);
  const post=(action:object)=>fetch(base+'api/action',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action})
  });
  const remote=await post({kind:'speak',target:'lily',text:'Привет'});
  assert.equal(remote.status,400);
  assert.equal(provider.requests.length,0);
  const badHost=await new Promise<number>((resolve,reject)=>{
    const r=request(base+'api/state',{headers:{host:'outside.example'}},res=>{
      res.resume();resolve(res.statusCode??0);
    });
    r.once('error',reject);r.end();
  });
  assert.equal(badHost,403);
  assert.equal((await fetch(base+'api/state',{headers:{Origin:'http://evil.test'}})).status,403);
  const move=await post({kind:'move',target:'corridor'});
  assert.equal(move.status,200);
  const result=await move.json() as {state:{room:{key:string}}};
  assert.equal(result.state.room.key,'corridor');
  assert.equal(provider.requests.length,0);
  const save=await (await fetch(base+'api/save')).text();
  const restored=await fetch(base+'api/load',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({checkpoint:save})
  });
  assert.equal(restored.status,200);
});
