/**
 * [GAME / INFERENCE] Primitive-only cutaway castle interiors.
 * The scene is decorative: collision & navigation are a prototype's local
 * coordinates, while authoritative room-to-room links come from manifest.
 */
import * as THREE from 'three';
import {wallFrame,onCameraSide} from './wall-geometry.js';
import {slotsFor,slotAt,validateSlots} from './architecture.js';
import {buildOpenings} from './openings.js';
const C={
  stone:0x868388,stoneDeep:0x55545c,grout:0x39383f,
  wood:0x684630,woodDark:0x39271f,gold:0xd1a35b,
  wine:0x702e3d,red:0xa84a46,cream:0xe1c9a0,
  floor:0x826e5f,blue:0x729ab1,fire:0xfcb55c,
  black:0x27252b,carpet:0x5a2936
};
const mat=(color,roughness=1)=>new THREE.MeshStandardMaterial({
  color,roughness,metalness:color===C.gold ? 0.26 : 0
});
function makeBuilder(group,obstacles){
  const box=(x,y,z,w,h,d,color,angle=0)=>{
    const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));
    o.position.set(x,y,z);o.rotation.y=angle;group.add(o);return o;
  };
  const cylinder=(x,y,z,top,bottom,h,color,sides=12)=>{
    const o=new THREE.Mesh(new THREE.CylinderGeometry(top,bottom,h,sides),
      mat(color));o.position.set(x,y,z);group.add(o);return o;
  };
  const plane=(x,y,z,w,d,color,angle=0)=>{
    const o=new THREE.Mesh(new THREE.PlaneGeometry(w,d),mat(color));
    o.rotation.x=-Math.PI/2;o.rotation.z=angle;
    o.position.set(x,y,z);group.add(o);return o;
  };
  const block=(x,z,r)=>obstacles.push({x,z,r});
  return {box,cylinder,plane,block};
}
function sign(group,text,x,y,z,width=2.4){
  const c=document.createElement('canvas');c.width=320;c.height=92;
  const ctx=c.getContext('2d');ctx.fillStyle='#332a26';
  ctx.fillRect(0,4,320,80);ctx.strokeStyle='#d3a866';ctx.lineWidth=5;
  ctx.strokeRect(5,8,310,72);ctx.fillStyle='#f0d5a2';
  ctx.font='bold 28px Georgia';ctx.textAlign='center';
  ctx.fillText(text,160,56,300);
  const tex=new THREE.CanvasTexture(c);
  tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=2;
  const label=new THREE.Sprite(new THREE.SpriteMaterial({
    map:tex,transparent:true,depthWrite:false
  }));
  label.position.set(x,y,z);label.scale.set(width,.72,1);
  group.add(label);
}
/**
 * Assemble an actual CURVED masonry wall, not radial fins.
 *
 * The original code placed every long wall box along the RADIUS (angle=a).
 * A circular wall needs its long edge TANGENT to the circle (angle=a+π/2).
 * Each segment has two versions: high masonry on the far side of the camera,
 * and a low cross-section parapet on the near side. This means a 360° orbit
 * keeps the room readable, instead of rotating behind opaque walls.
 */
function circularChamber(g,b,r,slots){
  const {cylinder,box}=b;
  cylinder(0,-.29,0,r+.32,r+.32,.50,C.stoneDeep,64);
  cylinder(0,-.075,0,r,r,.25,C.floor,64);
  const walls=[];
  const segments=48;
  const width=(2*Math.PI*r/segments)+.075;
  const wallMat=mat(C.stone);
  const foundationMat=mat(C.stoneDeep);
  const mortarMat=mat(C.grout);
  for(let i=0;i<segments;i++){
    const frame=wallFrame(i,segments,r);
    // An opening is a genuine interruption of full-height wall geometry.
    if(slotAt(frame.angle,slots,r))continue;
    const {x,z,rotation:direction}=frame;
    const high=new THREE.Group();
    high.position.set(x,0,z);high.rotation.y=direction;
    const wall=new THREE.Mesh(
      new THREE.BoxGeometry(.40,3.25,width),wallMat);
    wall.position.y=1.625;high.add(wall);
    // Two inconspicuous mortar courses emphasize stone rather than planks.
    for(const y of [.82,1.72,2.59]){
      const joint=new THREE.Mesh(
        new THREE.BoxGeometry(.425,.035,width+.01),mortarMat);
      joint.position.set(0,y,0);high.add(joint);
    }
    if(i%4===0){
      const pier=new THREE.Mesh(
        new THREE.BoxGeometry(.56,3.47,.38),foundationMat);
      pier.position.y=1.735;high.add(pier);
      const cap=new THREE.Mesh(
        new THREE.BoxGeometry(.78,.19,.56),wallMat);
      cap.position.y=3.40;high.add(cap);
    }
    g.add(high);
    const cut=new THREE.Group();
    cut.position.set(x,0,z);cut.rotation.y=direction;
    const plinth=new THREE.Mesh(
      new THREE.BoxGeometry(.46,.43,width),foundationMat);
    plinth.position.y=.215;cut.add(plinth);
    const coping=new THREE.Mesh(
      new THREE.BoxGeometry(.57,.115,width+.055),wallMat);
    coping.position.y=.48;cut.add(coping);
    g.add(cut);
    walls.push({frame,high,cut});
  }
  const innerRim=new THREE.Mesh(
    new THREE.TorusGeometry(r-.55,.045,5,64),foundationMat);
  innerRim.rotation.x=Math.PI/2;innerRim.position.y=.057;g.add(innerRim);
  // Circular inset rug, not a single floating rectangular decal.
  const rug=new THREE.Mesh(new THREE.CircleGeometry(2.2,48),
    mat(C.carpet));
  rug.rotation.x=-Math.PI/2;rug.position.y=.07;g.add(rug);
  return (yaw)=>{
    for(const section of walls){
      const close=onCameraSide(section.frame,yaw);
      section.high.visible=!close;
      section.cut.visible=close;
    }
  };
}
function couch(b,x,z,angle=0){
  const {box,block}=b;
  box(x,.47,z,2,.72,.78,C.red,angle);
  box(x,.83,z-.39,2,1.1,.27,C.wine,angle);
  box(x-1,.60,z,.2,.9,.85,C.wine,angle);
  box(x+1,.60,z,.2,.9,.85,C.wine,angle);
  box(x-.43,.88,z-.18,.7,.16,.5,C.cream,angle);
  block(x,z,1.2);
}
function table(b,x,z,w=1.4,d=1){
  b.box(x,.78,z,w,.17,d,C.wood);
  for(const dx of [-1,1])for(const dz of [-1,1])
    b.box(x+dx*(w/2-.12),.38,z+dz*(d/2-.12),.12,.7,.12,C.woodDark);
  b.block(x,z,Math.max(w,d)/2);
}
function fourPoster(b,x,z,angle=0,occupied=true){
  const {box,block}=b;
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=angle;
  const mBox=(a,bp,c,w,h,d,color)=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));
    m.position.set(a,bp,c);g.add(m);
  };
  // five-foot-long canopy bed with hanging red curtains
  mBox(0,.52,0,1.5,.3,2.18,C.woodDark);
  mBox(0,.77,0,1.32,.20,1.99,occupied?C.red:C.stone);
  mBox(0,.9,-.76,1.12,.25,.35,C.cream);
  for(const dx of [-.7,.7])for(const dz of [-1.03,1.03]){
    mBox(dx,1.18,dz,.15,2.36,.15,C.wood);
    mBox(dx,2.38,dz,.2,.17,.2,C.gold);
  }
  mBox(0,2.35,0,1.55,.18,2.22,C.wood);
  for(const dx of [-.72,.72])
    mBox(dx,1.54,0,.07,1.32,1.45,C.wine);
  b.block(x,z,1.2);
  return g;
}
export function buildStage(room,graph){
  const group=new THREE.Group();
  const obstacles=[];
  const b=makeBuilder(group,obstacles);
  const isCommon=room.key===graph.common.key;
  const isLanding=room.key===graph.landing.key;
  const radius=isCommon?10:isLanding?7.4:7.6;
  const slots=slotsFor(isCommon?'common':isLanding?'landing':'bedroom');
  validateSlots(slots,radius);
  const rotateWalls=circularChamber(group,b,radius,slots);
  const openings=buildOpenings(group,radius,slots);
  const portals=[...openings.portals];
  const candle=(x,z)=>{
    b.cylinder(x,.88,z,.12,.15,.2,C.woodDark,10);
    b.cylinder(x,1.18,z,.09,.11,.45,C.cream,12);
    b.cylinder(x,1.47,z,.09,.12,.18,C.fire,6);
    const lamp=new THREE.PointLight(0xffbb70,1.4,4);
    lamp.position.set(x,1.5,z);group.add(lamp);
  };
  if(isCommon){
    // All passages, fireplace and windows are in the shell, not furniture.
    // Leave an unobstructed path between portrait / both stair entrances.
    couch(b,-3,-2.2,.2);
    couch(b,3,-2.2,-.2);
    couch(b,0,2.3,Math.PI);
    table(b,0,-.5,2.2,1.4);
    candle(0,-.5);
    table(b,5,2.1,1.1,.8);candle(5,2.1);
    table(b,-5,2.3,1.1,.8);
    b.box(5.3,.66,-5.3,1.25,1.32,.47,C.woodDark);
    b.box(-5.1,.75,-5.6,1.4,1.5,.5,C.wood);
    b.block(5.3,-5.3,.75);b.block(-5.1,-5.6,.75);
    portals.push({kind:'fire',x:0,z:-(radius-2.10),
      desc:'В камине потрескивают поленья'});
  }else if(isLanding){
    b.plane(0,.07,0,3,5,C.carpet);
    for(let i=0;i<6;i++){
      const x=-5.1+i*.66;
      b.box(x,.15,4.4,1,.24,3.2,C.stoneDeep);
    }
    b.box(4.4,1.2,0,.8,2.4,3.2,C.stoneDeep);
  }else{
    // Keep five canopy beds per GRAPH bedroom, not an invented room count.
    const angles=[-1.1,-.43,.36,1.05,2.65];
    for(let i=0;i<5;i++){
      const a=angles[i];
      const x=Math.sin(a)*4.25,z=Math.cos(a)*4.25;
      group.add(fourPoster(b,x,z,-a,
        room.type==='legacy'||i<(room.students??0)));
      b.box(x*.8,.28,z*.8,.7,.52,.55,C.wood);
    }
    const rug=new THREE.Mesh(new THREE.CircleGeometry(2.15,30),
      new THREE.MeshStandardMaterial({color:C.carpet,roughness:1}));
    rug.rotation.x=-Math.PI/2;rug.position.y=.07;group.add(rug);
    b.box(0,.84,-5.15,2.2,1.6,.55,C.woodDark);
    b.block(0,-5.15,1.2);candle(0,-5.2);
  }
  const resources=[];
  group.traverse(obj=>{
    if(obj.isMesh||obj.isSprite){
      resources.push(obj.geometry);
      const materials=Array.isArray(obj.material)?obj.material:[obj.material];
      for(const material of materials){
        resources.push(material);
        if(material.map)resources.push(material.map);
      }
    }
  });
  return {
    group,obstacles,portals,radius,fire:openings.fire,
    architecture:slots,
    setCameraYaw(yaw){
      rotateWalls(yaw);
      openings.setCameraYaw(yaw);
    },
    dispose(){for(const res of new Set(resources))res?.dispose?.();}
  };
}
