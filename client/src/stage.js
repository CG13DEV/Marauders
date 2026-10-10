/**
 * [GAME / INFERENCE] Primitive-only cutaway castle interiors.
 * The scene is decorative: collision & navigation are a prototype's local
 * coordinates, while authoritative room-to-room links come from manifest.
 */
import * as THREE from 'three';
const C={
  stone:0x817567,stoneDeep:0x5f5955,grout:0x474448,
  wood:0x684630,woodDark:0x39271f,gold:0xd1a35b,
  wine:0x702e3d,red:0xa84a46,cream:0xe1c9a0,
  floor:0x826e5f,blue:0x729ab1,fire:0xfcb55c,
  black:0x27252b,carpet:0x5a2936
};
const mat=(color,roughness=1)=>new THREE.MeshStandardMaterial({
  color,roughness,metalness:color===C.gold?.26:0
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
function window(group,b,x,y,z,orientation=0){
  const frame=new THREE.Group();frame.position.set(x,y,z);
  frame.rotation.y=orientation;group.add(frame);
  const inner=new THREE.Mesh(new THREE.PlaneGeometry(1.36,2.0),
    new THREE.MeshBasicMaterial({color:C.blue,side:THREE.DoubleSide}));
  inner.position.z=.03;frame.add(inner);
  const bars=new THREE.Mesh(new THREE.BoxGeometry(.095,2.1,.12),
    mat(C.woodDark));bars.position.z=.11;frame.add(bars);
  for(let k of [-.45,.45]){
    const s=new THREE.Mesh(new THREE.BoxGeometry(1.48,.08,.14),
      mat(C.woodDark));s.position.set(0,k,.11);frame.add(s);
  }
  for(let side of [-1,1]){
    const jamb=new THREE.Mesh(new THREE.BoxGeometry(.15,2.25,.21),
      mat(C.stoneDeep));jamb.position.set(side*.74,0,.11);frame.add(jamb);
  }
  b.box(x,y-1.2,z,1.65,.25,.28,C.stoneDeep,orientation);
}
function circularChamber(g,b,r){
  const {cylinder,box,plane}=b;
  cylinder(0,-.29,0,r+.32,r+.32,.5,C.stoneDeep,64);
  cylinder(0,-.08,0,r,r,.22,C.floor,64);
  // concentric low-poly stone tiles; procedural and intentionally varied.
  const count=68;
  for(let i=0;i<count;i++){
    const a=i*2*Math.PI/count;
    const x=Math.cos(a)*(r-.54),z=Math.sin(a)*(r-.54);
    box(x,.045,z,1.3,.07,.14,i%5===0?C.gold:C.stoneDeep,a+Math.PI/2);
  }
  for(let i=0;i<40;i++){
    const a=(i+.5)*2*Math.PI/40;
    if(Math.cos(a)>.37&&Math.sin(a)>.37)continue; // cutaway camera side
    const x=Math.sin(a)*r,z=Math.cos(a)*r;
    box(x,1.6,z,.2,3.2,2*Math.PI*r/40+.13,
      i%7===0?C.stoneDeep:C.stone,a);
    if(i%5===0)cylinder(x,1.43,z,.21,.27,2.9,C.stoneDeep,8);
  }
  const circle=new THREE.Mesh(new THREE.TorusGeometry(r-.15,.07,6,64),
    mat(C.gold));circle.rotation.x=Math.PI/2;circle.position.y=.12;g.add(circle);
  plane(0,.06,0,3.4,2.8,C.carpet);
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
function spiral(b,group,x,z,wing){
  const {cylinder,box,block}=b;
  cylinder(x,1.5,z,.21,.25,3.0,C.stoneDeep);
  for(let i=0;i<9;i++){
    const a=(i/9)*Math.PI*1.8+(wing==='boys'?.25:2);
    const px=x+Math.sin(a)*.84,pz=z+Math.cos(a)*.84;
    box(px,.22+i*.22,pz,1.2,.16,.54,C.stoneDeep,a);
  }
  cylinder(x,.20,z,1.42,1.42,.28,C.woodDark,18);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(1.4,.06,6,24),
    mat(C.gold));rim.rotation.x=Math.PI/2;rim.position.set(x,.41,z);
  group.add(rim);block(x,z,1.37);
}
function fireplace(g,b,portals){
  b.box(0,1.22,-8.65,4.2,2.55,.6,C.stoneDeep);
  b.box(0,1,-8.27,2.55,1.8,.15,C.black);
  b.box(0,2.48,-8.17,4.4,.34,1.04,C.stone);
  for(let x of [-1.7,1.7])b.cylinder(x,1.18,-8.08,.22,.23,2.1,C.stone,8);
  const flame=new THREE.Mesh(new THREE.IcosahedronGeometry(.55,0),
    new THREE.MeshBasicMaterial({color:0xff9d39}));
  flame.position.set(0,.72,-8.07);flame.scale.set(.72,1.35,.4);g.add(flame);
  const glow=new THREE.PointLight(C.fire,12,8,2);
  glow.position.set(0,1.7,-6.8);g.add(glow);
  portals.push({kind:'fire',x:0,z:-6.4,desc:'В камине потрескивают поленья'});
  return {glow,flame};
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
  g.parent; b.block(x,z,1.2);
  return g;
}
function addPortrait(b,x,z){
  b.box(x,1.78,z,.08,1.4,1.1,C.gold);
  b.box(x,1.78,z+.06,.09,1.17,.87,C.woodDark);
}
export function buildStage(room,graph){
  const group=new THREE.Group();
  const obstacles=[],portals=[];
  const b=makeBuilder(group,obstacles);
  const isCommon=room.key===graph.common.key;
  const isLanding=room.key===graph.landing.key;
  const radius=isCommon?10:isLanding?7.4:7.6;
  circularChamber(group,b,radius);
  const candle=(x,z)=>{
    b.cylinder(x,.88,z,.12,.15,.2,C.woodDark,10);
    b.cylinder(x,1.18,z,.09,.11,.45,C.cream,12);
    b.cylinder(x,1.47,z,.09,.12,.18,C.fire,6);
    const lamp=new THREE.PointLight(0xffbb70,1.4,4);
    lamp.position.set(x,1.5,z);group.add(lamp);
  };
  const arch=(x,z,text)=>{
    b.box(x,1.6,z,2.5,3.1,.38,C.stoneDeep);
    b.box(x,1.55,z+.24,1.72,2.45,.10,C.woodDark);
    b.box(x,2.76,z+.28,2.15,.22,.45,C.gold);
    sign(group,text,x,3.25,z,2.1);
  };
  let fire=null;
  if(isCommon){
    fire=fireplace(group,b,portals);
    couch(b,-3,-2.2,.2);
    couch(b,3,-2.2,-.2);
    couch(b,0,2.3,Math.PI);
    table(b,0,-.5,2.2,1.4);
    candle(0,-.5);
    table(b,5,2.1,1.1,.8);
    candle(5,2.1);
    table(b,-5,2.3,1.1,.8);
    b.box(5.3,.66,-5.3,1.25,1.32,.47,C.woodDark);
    b.box(-5.1,.75,-5.6,1.4,1.5,.5,C.wood);
    b.block(5.3,-5.3,.75);
    b.block(-5.1,-5.6,.75);
    spiral(b,group,-7,0,'boys');
    spiral(b,group,7,0,'girls');
    arch(0,8.25,'ТОЛСТАЯ ДАМА');
    arch(-7,0,'МАЛЬЧИКИ');
    arch(7,0,'ДЕВОЧКИ');
    portals.push({kind:'wing',wing:'boys',x:-7,z:1.7,
      desc:'Винтовая лестница в спальни мальчиков'});
    portals.push({kind:'wing',wing:'girls',x:7,z:1.7,
      desc:'Винтовая лестница в спальни девочек'});
    portals.push({kind:'outside',x:0,z:6.85,
      desc:'Портретный вход — коридор замка'});
    window(group,b,-4,1.8,-8.45,0);
    window(group,b,4,1.8,-8.45,0);
    sign(group,'GRYFFINDOR',0,4.15,-8.72,3.2);
  }else if(isLanding){
    arch(0,-6.25,'ПОЛНАЯ ДАМА');
    portals.push({kind:'return',x:0,z:-4.95,
      desc:'Войти в гостиную Гриффиндора'});
    b.plane(0,.07,0,3,5,C.carpet);
    for(let i=0;i<6;i++){
      const x=-5.1+i*.66;
      b.box(x,.15,4.4,1,.24,3.2,C.stoneDeep);
    }
    b.box(4.4,1.2,0,.8,2.4,3.2,C.stoneDeep);
    window(group,b,-3,1.6,-5.8);
    sign(group,'7-й ЭТАЖ В КНИГАХ',0,4,-6.3,3);
  }else{
    const beds=5;
    const angles=[-1.1,-.43,.36,1.05,2.65];
    for(let i=0;i<beds;i++){
      const a=angles[i];
      const x=Math.sin(a)*4.25,z=Math.cos(a)*4.25;
      const bed=fourPoster(b,x,z,-a,
        room.type==='legacy'||i<(room.students??0));
      group.add(bed);
      // Bedside trunk / tiny student artifacts
      b.box(x*.80,.28,z*.80,.7,.52,.55,C.wood);
    }
    const rugs=new THREE.Mesh(new THREE.CircleGeometry(2.15,30),
      new THREE.MeshStandardMaterial({color:C.carpet,roughness:1}));
    rugs.rotation.x=-Math.PI/2;rugs.position.y=.07;group.add(rugs);
    b.box(0,.84,-5.15,2.2,1.6,.55,C.woodDark);b.block(0,-5.15,1.2);
    window(group,b,-2.7,2.0,-6.2,0);
    window(group,b,2.7,2.0,-6.2,0);
    candle(0,-5.2);
    arch(0,6.45,'В ГОСТИНУЮ');
    portals.push({kind:'return',x:0,z:5.2,
      desc:'Назад по лестнице в гостиную'});
    sign(group,room.type==='legacy'?'АРХИВ':String(room.year)+' КУРС',
      0,4.0,-6.95,2.2);
  }
  const resources=[];
  group.traverse(obj=>{
    if(obj.isMesh||obj.isSprite){
      resources.push(obj.geometry);
      const m=Array.isArray(obj.material)?obj.material:[obj.material];
      for(const material of m){resources.push(material);if(material.map)resources.push(material.map);}
    }
  });
  return {
    group,obstacles,portals,radius,fire,
    dispose(){for(const res of new Set(resources))res?.dispose?.();}
  };
}
