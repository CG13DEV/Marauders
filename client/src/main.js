import * as THREE from 'three';
import graph from './tower-graph.generated.json';
import {createAvatar} from './sprites.js';
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
let roomKey=graph.common.key;
const byKey=new Map([graph.common,graph.landing,...graph.research,...graph.legacy]
  .map(x=>[x.key,x]));
const adjacent=new Map();
for(const [a,b] of graph.links){
  if(!adjacent.has(a))adjacent.set(a,new Set());
  if(!adjacent.has(b))adjacent.set(b,new Set());
  adjacent.get(a).add(b);adjacent.get(b).add(a);
}
let stage=null,pendingPortal=null,target=null;
const player={x:STARTS.common.x,z:STARTS.common.z,facing:0,walking:false};
const avatar=createAvatar();scene.add(avatar.group);
const keys=new Set();
let lastView=-1,toastTimeout=null,interact=null,dialogWing=null;
const clock=new THREE.Clock();
const ray=new THREE.Raycaster();
const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.10);

function toast(text){
  const el=$('toast');el.textContent=text;el.classList.add('active');
  clearTimeout(toastTimeout);
  toastTimeout=setTimeout(()=>el.classList.remove('active'),3100);
}
function labelFor(room){
  if(room.key===graph.common.key)return 'Гостиная Гриффиндора';
  if(room.key===graph.landing.key)return 'Портретный коридор';
  if(room.type==='legacy')return room.wing==='boys'
    ?'Старая спальня мальчиков':'Старая спальня девочек';
  return String(room.year)+'-й курс · '+(room.wing==='boys'?'мальчики':'девочки')+
    ' · спальня '+room.section;
}
function detailFor(room){
  if(room.key===graph.common.key)
    return 'Красное бархатное кресло, золотые отблески и лестницы в спальни.';
  if(room.key===graph.landing.key)
    return 'Условная точка соединения башни с графом замка.';
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
  if(stage){scene.remove(stage.group);stage.dispose();}
  const room=byKey.get(roomKey);
  stage=buildStage(room,graph);
  scene.add(stage.group);
  pendingPortal=null;target=null;
  const preference=roomKey===graph.common.key?STARTS.common:
    roomKey===graph.landing.key?STARTS.landing:STARTS.bedroom;
  const spawn=safeSpawn(stage,preference);
  player.x=spawn.x;player.z=spawn.z;
  // A fresh room inherits the current camera orientation and cutaway.
  stage.setCameraYaw(yaw);
  avatar.group.position.set(player.x,0,player.z);
  updateHeader();
}
function enter(next){
  if(next===roomKey)return;
  if(!adjacent.get(roomKey)?.has(next)){
    toast('Между этими комнатами нет прямого прохода в графе.');
    return;
  }
  if(!byKey.has(next)){toast('Комната пока за пределами прототипа.');return;}
  roomKey=next;rebuildScene();
  toast('Ты вошёл: '+labelFor(byKey.get(next)));
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
  const portal=nearestPortal();
  const hint=$('action-hint');
  hint.hidden=!portal;
  if(portal)$('action-hint-text').textContent=portal.desc;
  interact=portal;
}
$('interact-button').addEventListener('click',()=>usePortal(interact));
function clipMovement(x,z){
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
function tick(){
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
renderer.setAnimationLoop(tick);
if(window.Telegram?.WebApp){
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
}
