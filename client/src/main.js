import * as THREE from 'three';
import graph from './tower-graph.generated.json';
import {createAvatar} from './sprites.js';
import {createLivingRoom,LIVING_ACTORS,PLAYER_CAST} from './living-room.js';
import {buildStage} from './stage.js';
import {STARTS,safeSpawn,moveWithCollision,keyForControl} from './movement.js';
import './style.css';

const $=(id)=>document.getElementById(id);
const area=$('viewport');
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x26262a);
scene.fog=new THREE.FogExp2(0x26262a,.013);
const ambient=new THREE.HemisphereLight(0xe6d6b3,0x463e41,2.15);
scene.add(ambient);
const sunlight=new THREE.DirectionalLight(0xffe2ae,2.3);
sunlight.position.set(9,18,3);scene.add(sunlight);
const rim=new THREE.DirectionalLight(0x8fa4bc,.9);
rim.position.set(-7,9,-11);scene.add(rim);
const renderer=new THREE.WebGLRenderer({alpha:false,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.22;
area.append(renderer.domElement);
const camera=new THREE.OrthographicCamera(-12,12,12,-12,.05,140);
let yaw=Math.PI/4,zoom=11.4;
const params=new URLSearchParams(window.location.search);
const chosen=params.get('playAs');
const playerDefinition=PLAYER_CAST.find(a=>a.key===chosen)??PLAYER_CAST[3];
const playerKey=playerDefinition.key;
let roomKey=graph.common.key;
const byKey=new Map([graph.common,graph.landing,...graph.research,...graph.legacy]
  .map(x=>[x.key,x]));
const adjacent=new Map();
for(const [a,b] of graph.links){
  if(!adjacent.has(a))adjacent.set(a,new Set());
  if(!adjacent.has(b))adjacent.set(b,new Set());
  adjacent.get(a).add(b);adjacent.get(b).add(a);
}
let stage=null,pendingPortal=null,target=null,artifactVisual=null;
const player={x:STARTS.common.x,z:STARTS.common.z,facing:0,walking:false};
const avatar=createAvatar({variant:playerDefinition.variant});
scene.add(avatar.group);
const living=createLivingRoom(graph,{playerKey});
$('player-choice').value=playerKey;
$('player-choice').addEventListener('change',event=>{
  if(!PLAYER_CAST.some(c=>c.key===event.target.value))return;
  const location=new URL(window.location.href);
  location.searchParams.set('playAs',event.target.value);
  window.location.assign(location.href);
});
$('player-status').textContent='ТЫ ИГРАЕШЬ: '+playerDefinition.name;
const inTestMode=new URLSearchParams(window.location.search).has('testMode');
const standIns=[]; // presentation of actual ECS NPCs; never a decision source
const keys=new Set();
let lastView=-1,toastTimeout=null,interact=null,dialogWing=null;
const clock=new THREE.Clock();
// A real-time timer advances authority independently of WebGL rendering.
const GAME_SECONDS_PER_REAL_SECOND=30; // 10 min/game tick every 20 real seconds
let livingLastAt=performance.now(),livingFraction=0;
const ray=new THREE.Raycaster();
const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.10);

function toast(text){
  const el=$('toast');el.textContent=text;el.classList.add('active');
  clearTimeout(toastTimeout);
  toastTimeout=setTimeout(()=>el.classList.remove('active'),3100);
}
function labelFor(room){
  if(room.key===graph.common.key)return 'Гостиная Гриффиндора';
  if(room.key===graph.landing.key)return 'Лестничная площадка у портрета';
  if(room.type==='legacy')return room.wing==='boys'
    ?'Старая спальня мальчиков':'Старая спальня девочек';
  return String(room.year)+'-й курс · '+(room.wing==='boys'?'мальчики':'девочки')+
    ' · спальня '+room.section;
}
function detailFor(room){
  if(room.key===graph.common.key)
    return 'Четыре автономных ученика из отдельной ECS-микросимуляции. Решения принимает мир.';
  if(room.key===graph.landing.key)
    return 'С лестницы замка — по каменной площадке к портрету Толстой дамы.';
  if(room.type==='legacy')
    return 'Узел старого графа. В исследовательской конфигурации здесь никто не живёт.';
  return 'По текущему графу здесь живут '+room.students+
    ' из пяти возможных учеников.';
}
function updateHeader(){
  const room=byKey.get(roomKey);
  $('room-title').textContent=labelFor(room);
  $('room-subtitle').textContent=detailFor(room);
  $('room-meta').textContent=room.type==='research'
    ?'[GAME] '+room.students+' / '+room.capacity+' УЧЕНИКОВ'
    :room.type==='legacy'?'[GAME] ИСХОДНЫЙ УЗЕЛ'
    :room.type==='landing'?'ГРАФ · west_landing_4'
    :'ГРАФ · dorm_gryffindor';
  $('room-counter').textContent=graph.totals.bedrooms+' СПАЛЕН В ГРАФЕ';
  $('go-common').disabled=roomKey===graph.common.key;
  updateNavigator();
}
function rebuildScene(){
  for(const actor of standIns){
    scene.remove(actor.sprite.group);
    actor.dispose();
  }
  standIns.length=0;
  if(stage){scene.remove(stage.group);stage.dispose();}
  artifactVisual=null;
  const room=byKey.get(roomKey);
  stage=buildStage(room,graph);
  scene.add(stage.group);
  if(roomKey===graph.common.key)buildCupVisual();
  pendingPortal=null;target=null;
  const preference=roomKey===graph.common.key?STARTS.common:
    roomKey===graph.landing.key?STARTS.landing:STARTS.bedroom;
  const spawn=safeSpawn(stage,preference);
  player.x=spawn.x;player.z=spawn.z;
  // A fresh room inherits the current camera orientation and cutaway.
  stage.setCameraYaw(yaw);
  avatar.group.position.set(player.x,0,player.z);
  rebuildLivingSprites();
  updateHeader();
}

// Room coordinates are world-data from the micro-space simulator.
function actorDefinition(key){return LIVING_ACTORS.find(actor=>actor.key===key);}
function positionForActor(key){
  const local=living.snapshot().activities.find(a=>a.actor===key);
  const pref=roomKey===graph.common.key&&local
    ?{x:local.x,z:local.z}
    :roomKey===graph.landing.key?STARTS.landing:STARTS.bedroom;
  return safeSpawn(stage,pref);
}
function addLivingSprite(key,point){
  const definition=actorDefinition(key);
  if(!definition)return null;
  const sprite=createAvatar({variant:definition.variant,scale:.96});
  sprite.group.position.set(point.x,0,point.z);
  scene.add(sprite.group);
  const actor={key,sprite,x:point.x,z:point.z,facing:0,walking:false,
    journeyKey:null,journeyStart:null,mode:'idle'};
  const tagCanvas=document.createElement('canvas');
  tagCanvas.width=192;tagCanvas.height=40;
  const tagTexture=new THREE.CanvasTexture(tagCanvas);
  const tagMaterial=new THREE.SpriteMaterial({
    map:tagTexture,transparent:true,depthWrite:false});
  const tag=new THREE.Sprite(tagMaterial);
  tag.position.set(0,3.4,0);tag.scale.set(2.6,.54,1);
  sprite.group.add(tag);
  actor.setLabel=label=>{
    if(actor.label===label)return;
    actor.label=label;
    const ctx=tagCanvas.getContext('2d');
    ctx.clearRect(0,0,192,40);
    ctx.fillStyle='rgba(24,20,30,.76)';
    ctx.fillRect(0,0,192,40);
    ctx.font='bold 17px sans-serif';ctx.textAlign='center';
    ctx.fillStyle='#f8e1b1';ctx.fillText(label,96,26);
    tagTexture.needsUpdate=true;
  };
  actor.dispose=()=>{
    sprite.dispose();tagTexture.dispose();tagMaterial.dispose();
  };
  standIns.push(actor);return actor;
}
function rebuildLivingSprites(){
  const occupants=living.snapshot().locations
    .filter(([,location])=>location===roomKey).map(([key])=>key);
  for(const key of occupants)addLivingSprite(key,positionForActor(key));
}
function entryPoint(from,to,actorKey){
  if(!stage)return {x:0,z:0};
  const fromRoom=byKey.get(from),toRoom=byKey.get(to);
  const portal=stage.portals.find(p=>{
    if(from===roomKey && to===graph.landing.key)return p.kind==='outside';
    if(to===roomKey && from===graph.landing.key)return p.kind==='outside'||p.kind==='return';
    if(from===roomKey && to===graph.common.key)return p.kind==='return';
    if(to===roomKey && from===graph.common.key)return p.kind==='return'||p.kind==='wing';
    if((from===roomKey||to===roomKey) &&
       (fromRoom?.wing||toRoom?.wing))return p.kind==='wing' &&
         p.wing===(from===roomKey?toRoom?.wing:fromRoom?.wing);
    return false;
  }) ?? stage.portals.find(p=>p.kind==='return'||p.kind==='outside');
  if(!portal)return positionForActor(actorKey);
  // The opening is physical architecture; stop inside it, not beyond a wall.
  return safeSpawn(stage,{x:portal.x*.82,z:portal.z*.82});
}
function scheduleLivingMovement(move){
  if(!stage)return;
  const {actor:actorKey,from,to}=move;
  if(from===roomKey && to!==roomKey){
    // Arrival at the next ECS room is authoritative; never delay it just
    // to finish a local decorative animation.
    const actor=standIns.find(x=>x.key===actorKey);
    if(actor){scene.remove(actor.sprite.group);actor.dispose();
      standIns.splice(standIns.indexOf(actor),1);}
  }else if(to===roomKey && from!==roomKey){
    if(standIns.some(x=>x.key===actorKey))return;
    addLivingSprite(actorKey,entryPoint(from,to,actorKey));
  }
}

const CUP_POINT=Object.freeze({x:0,z:0});
function buildCupVisual(){
  const group=new THREE.Group();
  const metal=new THREE.MeshStandardMaterial({
    color:0xa98242,metalness:.64,roughness:.38});
  const black=new THREE.MeshStandardMaterial({
    color:0x473822,metalness:.35,roughness:.75});
  const stand=new THREE.Mesh(new THREE.CylinderGeometry(.54,.64,.26,14),black);
  stand.position.y=.15;group.add(stand);
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.07,.11,.27,10),metal);
  stem.position.y=.41;group.add(stem);
  const bowl=new THREE.Mesh(new THREE.CylinderGeometry(.26,.13,.33,14),metal);
  bowl.position.y=.68;group.add(bowl);
  const highlight=new THREE.PointLight(0xffc983,.5,2);
  highlight.position.y=.9;group.add(highlight);
  group.position.set(CUP_POINT.x,0,CUP_POINT.z);
  group.userData={bowl,stem};
  stage.group.add(group);
  artifactVisual=group;
}
function updateCupVisual(view){
  if(!artifactVisual)return;
  const broken=view.cup?.broken===true;
  artifactVisual.userData.bowl.rotation.z=broken?1.3:0;
  artifactVisual.userData.bowl.position.y=broken?.30:.68;
  artifactVisual.userData.stem.visible=!broken;
}

function updateLivingUi(snapshot){
  $('living-clock').textContent='ДЕНЬ '+(Math.floor(snapshot.worldSeconds/86400)+1)+
    ' · '+snapshot.clock;
  const locals=snapshot.locations.filter(([,room])=>room===roomKey).length;
  $('living-population').textContent=locals+' В КОМНАТЕ / '+
    snapshot.locations.length+' NPC';
  $('player-status').textContent='ТЫ ИГРАЕШЬ: '+snapshot.player.name;
  updateCupVisual(snapshot.player);
  const log=$('living-events');log.replaceChildren();
  for(const line of snapshot.recent){
    const p=document.createElement('p');p.textContent=line;log.append(p);
  }
  if(!snapshot.recent.length){
    const p=document.createElement('p');p.textContent=
      'Жители самостоятельно выбирают занятия…';log.append(p);
  }
  const activityList=$('living-people');activityList.replaceChildren();
  const modes={walking:'идёт',read:'читает',observe:'наблюдает',
    rest:'отдыхает',idle:'осматривается'};
  for(const a of snapshot.activities){
    const row=document.createElement('div');
    const person=actorDefinition(a.actor);
    row.textContent=(person?.name??a.actor)+' · '+(modes[a.mode]??a.mode);
    activityList.append(row);
  }
}
function paintLivingChange(result){
  for(const movement of result.delta.movements)scheduleLivingMovement(movement);
  updateLivingUi(result.snapshot);
  return result;
}
function stepLiving(){
  // Diagnostic: advance to the next academic decision boundary.
  return paintLivingChange(living.advance());
}
function advanceLivingSeconds(seconds){
  return paintLivingChange(living.advanceSeconds(seconds));
}
function animateLiving(dt){
  const state=living.snapshot();
  const journeys=new Map(state.journeys.map(j=>[j.actor,j]));
  const activities=new Map(state.activities.map(a=>[a.actor,a]));
  const modes={walking:'идёт',read:'читает',observe:'смотрит в окно',
    rest:'отдыхает',idle:'ожидает'};
  for(const actor of standIns){
    const leg=journeys.get(actor.key);
    if(leg&&leg.from===roomKey){
      const key=leg.from+'→'+leg.to;
      if(actor.journeyKey!==key){
        actor.journeyKey=key;
        actor.journeyStart={x:actor.x,z:actor.z};
      }
      const target=entryPoint(leg.from,leg.to,actor.key);
      actor.x=actor.journeyStart.x+
        (target.x-actor.journeyStart.x)*leg.progress;
      actor.z=actor.journeyStart.z+
        (target.z-actor.journeyStart.z)*leg.progress;
      const dx=target.x-actor.journeyStart.x;
      const dz=target.z-actor.journeyStart.z;
      if(Math.hypot(dx,dz)>.001)actor.facing=Math.atan2(dx,dz);
      actor.walking=!leg.paused&&leg.progress<1;
      actor.setLabel(actorDefinition(actor.key).name+' · идёт');
    }else{
      actor.journeyKey=null;actor.journeyStart=null;
      const local=roomKey===graph.common.key?activities.get(actor.key):null;
      if(local){
        // Coordinates are a published simulation state, not client steering.
        actor.x=local.x;actor.z=local.z;actor.facing=local.facing;
        actor.walking=local.mode==='walking';
        actor.mode=local.mode;
      }else actor.walking=false;
      const label=actorDefinition(actor.key).name+' · '+
        (modes[local?.mode]??'здесь');
      actor.setLabel(label);
    }
    actor.sprite.group.position.set(actor.x,0,actor.z);
    actor.sprite.update(dt,actor.walking,actor.facing,yaw);
  }
}

function enter(next){
  if(next===roomKey)return;
  if(!adjacent.get(roomKey)?.has(next)){
    toast('Между этими комнатами нет прямого прохода в графе.');
    return;
  }
  if(!byKey.has(next)){toast('Комната пока за пределами прототипа.');return;}
  const result=living.submit({type:'move',destination:next});
  if(!result.ok){
    toast('Мир отказал в переходе: '+result.reason);
    return;
  }
  roomKey=result.player.room;
  rebuildScene();
  updateLivingUi(living.snapshot());
  toast('Ты вошёл: '+labelFor(byKey.get(roomKey)));
}
function updateNavigator(){
  const panel=$('room-navigator');panel.replaceChildren();
  if(roomKey!==graph.common.key){
    const p=document.createElement('p');p.className='panel-explain';
    p.textContent='Прямой проход отсюда ведёт только в гостиную. Вернись, чтобы выбрать другую спальню.';
    p.style.display='block';panel.append(p);return;
  }
  const title=document.createElement('div');title.className='group-title';
  title.textContent='ДВЕ ВИНТОВЫЕ ЛЕСТНИЦЫ';panel.append(title);
  for(const wing of ['boys','girls']){
    const rooms=graph.research.filter(r=>r.wing===wing);
    const card=document.createElement('div');card.className='wing-card';
    const name=document.createElement('div');
    name.innerHTML=wing==='boys'?'Мальчики<br/><strong>7 курсов</strong>':'Девочки<br/><strong>7 курсов</strong>';
    const btn=document.createElement('button');btn.textContent=rooms.length+' спальни · ↗';
    btn.addEventListener('click',()=>openDorms(wing));
    card.append(name,btn);panel.append(card);
  }
  const next=document.createElement('div');next.className='group-title';
  next.textContent='ВНЕ БАШНИ';panel.append(next);
  const outside=document.createElement('div');outside.className='wing-card';
  const text=document.createElement('span');text.textContent='Коридор у портрета';
  const go=document.createElement('button');go.textContent='Выйти ↗';
  go.addEventListener('click',()=>enter(graph.landing.key));
  outside.append(text,go);panel.append(outside);
}
function makeDormRow(room){
  const node=document.createElement('div');node.className='dorm-row';
  const info=document.createElement('div');
  const title=document.createElement('div');title.className='name';
  title.textContent=labelFor(room);
  const sub=document.createElement('div');sub.className='detail';
  sub.textContent=room.type==='legacy'
    ?'Исходный узел графа · без жильцов'
    :'Занято '+room.students+' / '+room.capacity+' мест · '+room.key;
  info.append(title,sub);
  const b=document.createElement('button');b.textContent='Войти →';
  b.addEventListener('click',()=>{
    closeDialog();enter(room.key);
  });
  node.append(info,b);return node;
}
function openDorms(wing){
  if(roomKey!==graph.common.key){
    toast('Сначала нужно вернуться в гостиную.');return;
  }
  dialogWing=wing;
  const isBoy=wing==='boys';
  $('dialog-title').textContent=isBoy?'Лестница мальчиков':'Лестница девочек';
  $('dialog-note').textContent='Все двери — реальные узлы из графа 600 учеников. '+
    'В нашей реконструкции у одного курса может быть несколько спален (до пяти мест в каждой).';
  const container=$('dialog-rooms');container.replaceChildren();
  for(let year=1;year<=7;year++){
    const t=document.createElement('div');t.className='year-heading';
    t.textContent='КУРС '+year;container.append(t);
    for(const r of graph.research.filter(r=>r.wing===wing&&r.year===year))
      container.append(makeDormRow(r));
  }
  const t=document.createElement('div');t.className='year-heading';
  t.textContent='УЗЕЛ СТАРОЙ МОДЕЛИ · [GAME]';container.append(t);
  for(const r of graph.legacy.filter(r=>r.wing===wing))
    container.append(makeDormRow(r));
  $('dialog-backdrop').hidden=false;
}
function closeDialog(){dialogWing=null;$('dialog-backdrop').hidden=true;}
$('dialog-close').addEventListener('click',closeDialog);
$('dialog-backdrop').addEventListener('click',e=>{
  if(e.target===$('dialog-backdrop'))closeDialog();
});
$('go-common').addEventListener('click',()=>enter(graph.common.key));
function usePortal(portal){
  if(!portal)return;
  if(portal.kind==='inspect_cup'){
    const result=living.submit({type:'inspect_cup'});
    toast(result.ok
      ?(result.player.cup?.broken
        ?'На полу лежат осколки старой чашки.'
        :'Старая чашка цела. Тяжёлая, с потемневшим ободком.')
      :'Осмотр не удался: '+result.reason);
    updateLivingUi(living.snapshot());return;
  }
  if(portal.kind==='wing'){openDorms(portal.wing);return;}
  if(portal.kind==='outside'){enter(graph.landing.key);return;}
  if(portal.kind==='return'){enter(graph.common.key);return;}
  if(portal.kind==='fire'){toast('Потрескивают поленья. Сейчас мы исследуем пространство, не симулируем время.');}
}
function nearestPortal(max=2.25){
  if(!stage)return null;
  let winner=null,dist=max;
  for(const p of stage.portals){
    const d=Math.hypot(player.x-p.x,player.z-p.z);
    if(d<dist){winner=p;dist=d;}
  }
  return winner;
}
function refreshHint(){
  const nearCup=roomKey===graph.common.key&&
    Math.hypot(player.x-CUP_POINT.x,player.z-CUP_POINT.z)<1.85;
  $('cup-actions').hidden=!nearCup;
  const state=living.snapshot().player;
  $('cup-inspection').textContent=state.cup?.broken?
    'Старинная чашка разбита':state.cup?.inspected?
    'Ты осмотрел старинную чашку':'Старинная чашка · неизвестный предмет';
  $('cup-break').disabled=state.cup?.broken===true;
  const portal=nearCup?{kind:'inspect_cup',desc:'Осмотреть старую чашку'}:
    nearestPortal();
  const hint=$('action-hint');
  hint.hidden=!portal;
  if(portal)$('action-hint-text').textContent=portal.desc;
  interact=portal;
}
$('interact-button').addEventListener('click',()=>usePortal(interact));
$('cup-break').addEventListener('click',()=>{
  const near=roomKey===graph.common.key &&
    Math.hypot(player.x-CUP_POINT.x,player.z-CUP_POINT.z)<1.85;
  if(!near)return;
  const result=living.submit({type:'break_cup'});
  toast(result.ok?'Чашка разбилась. Это событие осталось в истории мира.':
    'Нельзя разбить чашку: '+result.reason);
  updateLivingUi(living.snapshot());
});
function clipMovement(x,z){
  if(stage.bounds)return {
    x:THREE.MathUtils.clamp(x,stage.bounds.minX,stage.bounds.maxX),
    z:THREE.MathUtils.clamp(z,stage.bounds.minZ,stage.bounds.maxZ)
  };
  const radius=stage.radius-1.15;
  const length=Math.hypot(x,z);
  if(length>radius){const scale=radius/length;x*=scale;z*=scale;}
  return {x,z};
}
function move(dx,dz){
  const next=moveWithCollision(stage,player,dx,dz);
  player.x=next.x;player.z=next.z;
}
function calculateCamera(){
  const ratio=area.clientWidth/Math.max(1,area.clientHeight);
  camera.left=-zoom*ratio;camera.right=zoom*ratio;
  camera.top=zoom;camera.bottom=-zoom;camera.updateProjectionMatrix();
  renderer.setSize(area.clientWidth,area.clientHeight,false);
}
function redrawCamera(){
  camera.position.set(player.x+Math.sin(yaw)*24,19.8,
    player.z+Math.cos(yaw)*24);
  camera.lookAt(player.x,0,player.z);
  // The cutaway must follow the actual camera, including Q/E/drag.
  stage?.setCameraYaw(yaw);
}
function rotate(amount){yaw=(yaw+amount+Math.PI*2)%(Math.PI*2);redrawCamera();}
function changeZoom(amount){zoom=THREE.MathUtils.clamp(zoom+amount,6.6,16);
  calculateCamera();}
$('rotate-left').addEventListener('click',()=>rotate(-Math.PI/8));
$('rotate-right').addEventListener('click',()=>rotate(Math.PI/8));
$('zoom-out').addEventListener('click',()=>changeZoom(1.3));
$('zoom-in').addEventListener('click',()=>changeZoom(-1.3));
$('controls-toggle').addEventListener('click',()=>{
  toast('Нажатие на пол — идти. Перетаскивание — поворот камеры. На клавиатуре: WASD, Q/E, F.');
});
const pointer={down:false,x:0,y:0,moved:false,previousX:0};
area.addEventListener('pointerdown',e=>{
  if(!$('dialog-backdrop').hidden)return;
  area.setPointerCapture(e.pointerId);
  pointer.down=true;pointer.x=e.clientX;pointer.y=e.clientY;
  pointer.previousX=e.clientX;pointer.moved=false;
});
area.addEventListener('pointermove',e=>{
  if(!pointer.down)return;
  const dist=Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y);
  if(dist>7)pointer.moved=true;
  if(pointer.moved){
    rotate((e.clientX-pointer.previousX)*.009);
    pointer.previousX=e.clientX;
  }
});
function tapGround(e){
  const box=renderer.domElement.getBoundingClientRect();
  const point=new THREE.Vector2(
    (e.clientX-box.left)/box.width*2-1,
    -((e.clientY-box.top)/box.height*2-1)
  );
  ray.setFromCamera(point,camera);
  const hit=new THREE.Vector3();
  if(!ray.ray.intersectPlane(plane,hit))return;
  const desired=clipMovement(hit.x,hit.z);
  const near=stage.portals.find(p=>
    Math.hypot(desired.x-p.x,desired.z-p.z)<2);
  if(near&&Math.hypot(player.x-near.x,player.z-near.z)<2.6){
    usePortal(near);return;
  }
  const goal=near?{x:near.x,z:near.z}:desired;
  target=goal;pendingPortal=near||null;
}
area.addEventListener('pointerup',e=>{
  if(pointer.down&&!pointer.moved)tapGround(e);
  pointer.down=false;
});
area.addEventListener('pointercancel',()=>{pointer.down=false;});
area.addEventListener('wheel',e=>{
  e.preventDefault();changeZoom(e.deltaY>0?.8:-.8);
},{passive:false});
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeDialog();return;}
  // KeyboardEvent.code is physical: KeyW works under Russian layout too.
  const key=keyForControl(e);
  if(key===null)return;
  e.preventDefault();
  if(key==='f'&&!e.repeat&&$('dialog-backdrop').hidden)usePortal(nearestPortal());
  if(key==='q'&&!e.repeat)rotate(-Math.PI/8);
  if(key==='e'&&!e.repeat)rotate(Math.PI/8);
  keys.add(key);
});
window.addEventListener('keyup',e=>{
  const key=keyForControl(e);
  if(key!==null)keys.delete(key);
});
window.addEventListener('blur',()=>keys.clear());
window.addEventListener('resize',calculateCamera);
let renderedFrames=0;
function tick(){
  renderedFrames++;
  const dt=Math.min(clock.getDelta(),.055);
  const blocked=!$('dialog-backdrop').hidden;
  const front={x:-Math.sin(yaw),z:-Math.cos(yaw)};
  const right={x:Math.cos(yaw),z:-Math.sin(yaw)};
  let x=0,z=0;
  if(!blocked){
    if(keys.has('w')||keys.has('arrowup')){x+=front.x;z+=front.z;}
    if(keys.has('s')||keys.has('arrowdown')){x-=front.x;z-=front.z;}
    if(keys.has('d')||keys.has('arrowright')){x+=right.x;z+=right.z;}
    if(keys.has('a')||keys.has('arrowleft')){x-=right.x;z-=right.z;}
    if(x||z){target=null;pendingPortal=null;}
    else if(target){
      x=target.x-player.x;z=target.z-player.z;
      if(Math.hypot(x,z)<.23){
        target=null;x=0;z=0;
        if(pendingPortal&&nearestPortal(2.7)?.kind===pendingPortal.kind){
          const next=pendingPortal;pendingPortal=null;usePortal(next);
        }
      }
    }
  }
  const magnitude=Math.hypot(x,z);
  let moving=magnitude>.001;
  if(moving){
    x/=magnitude;z/=magnitude;
    player.facing=Math.atan2(x,z);
    const step=Math.min(3.1*dt,magnitude);
    const previousX=player.x,previousZ=player.z;
    move(x*step,z*step);
    moving=Math.hypot(player.x-previousX,player.z-previousZ)>.0001;
    if(target&&!moving){target=null;pendingPortal=null;}
  }
  avatar.group.position.set(player.x,0,player.z);
  const frame=avatar.update(dt,moving,player.facing,yaw);
  // The renderer ONLY paints validated observer data.
  animateLiving(dt);
  if(frame!==lastView){lastView=frame;
    $('sprite-facing').textContent='РАКУРС '+(frame+1)+' / 8';}
  $('heading-rose').style.transform='rotate('+(-yaw*180/Math.PI)+'deg)';
  if(stage.fire){
    stage.fire.glow.intensity=11.7+Math.sin(performance.now()*.004)*1.3;
    stage.fire.flame.scale.y=1.26+Math.sin(performance.now()*.006)*.12;
  }
  redrawCamera();
  refreshHint();
  renderer.render(scene,camera);
}
rebuildScene();calculateCamera();
updateLivingUi(living.snapshot());
renderer.setAnimationLoop(tick);
const livingTimer=inTestMode?null:setInterval(()=>{
  const now=performance.now();
  const realSeconds=Math.max(0,Math.min(.5,(now-livingLastAt)/1000));
  livingLastAt=now;
  if(document.hidden)return;
  livingFraction+=realSeconds*GAME_SECONDS_PER_REAL_SECOND;
  const seconds=Math.floor(livingFraction);
  if(seconds>0){
    livingFraction-=seconds;
    advanceLivingSeconds(seconds);
  }
},90);
document.addEventListener('visibilitychange',()=>{
  livingLastAt=performance.now();
});
window.addEventListener('pagehide',()=>{
  if(livingTimer!==null)clearInterval(livingTimer);
});
// Opt-in browser smoke diagnostics; no access to the simulation, network,
// credentials or hidden NPC state. Production default exposes nothing.
if(inTestMode){
  window.__towerTest=Object.freeze({
    snapshot:()=>Object.freeze({
      player:Object.freeze({x:player.x,z:player.z}),
      identity:playerKey,
      roomKey,extras:standIns.length,
      live:living.snapshot(),
      visibleActors:standIns.map(actor=>({key:actor.key,x:actor.x,z:actor.z,
        mode:actor.mode})),
      openings:stage?.group.children
        .filter(o=>o.name.startsWith('wall-slot:')).map(o=>o.name),
      cameraYaw:yaw,
      layout:stage?.layout,
      activePortals:stage?.portals.map(p=>p.kind),
      frames:renderedFrames,
      canvasWidth:renderer.domElement.width
    }),
    submitPlayer:intent=>living.submit(intent),
    advanceLiving:()=>stepLiving(),
    advanceLivingSeconds:seconds=>advanceLivingSeconds(seconds)
  });
}
if(window.Telegram?.WebApp){
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
}
