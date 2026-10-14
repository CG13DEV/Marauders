/**
 * [GAME / INFERENCE] Primitive-only cutaway castle interiors.
 * The scene is decorative: collision & navigation are a prototype's local
 * coordinates, while authoritative room-to-room links come from manifest.
 */
import * as THREE from 'three';
import {wallFrame,onCameraSide} from './wall-geometry.js';
import {slotsFor,slotAt,validateSlots} from './architecture.js';
import {buildOpenings} from './openings.js';
import {bedroomPlan,validateBedroomPlan} from './layout-bedroom.js';
import {commonPlan,validateCommonPlan} from './layout-common.js';
import {buildLandingSpace} from './layout-landing.js';
import {buildGallerySpace} from './layout-gallery.js';
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
  const cos=Math.cos(angle),sin=Math.sin(angle);
  const part=(dx,y,dz,w,h,d,color)=>{
    const px=x+dx*cos+dz*sin,pz=z-dx*sin+dz*cos;
    b.box(px,y,pz,w,h,d,color,angle);
  };
  part(0,.47,0,2,.72,.78,C.red);
  part(0,.83,-.39,2,1.1,.27,C.wine);
  part(-1,.60,0,.2,.9,.85,C.wine);
  part(1,.60,0,.2,.9,.85,C.wine);
  part(-.43,.88,-.18,.7,.16,.5,C.cream);
  b.block(x,z,1.18);
}
function table(b,x,z,w=1.4,d=1){
  b.box(x,.78,z,w,.17,d,C.wood);
  for(const dx of [-1,1])for(const dz of [-1,1])
    b.box(x+dx*(w/2-.12),.38,z+dz*(d/2-.12),
      .12,.7,.12,C.woodDark);
  b.block(x,z,Math.max(w,d)/2);
}
function bookshelf(b,x,z,angle=0){
  b.box(x,1.18,z,1.65,2.35,.42,C.woodDark,angle);
  for(let y=.5;y<=1.92;y+=.43){
    b.box(x,y,z,1.51,.12,.48,C.wood,angle);
    for(let i=0;i<7;i++)
      b.box(x-.55+i*.18,y+.15,z+.27,.13,.26+(i%3)*.035,
        .13,i%3===0?C.wine:i%3===1?C.gold:C.blue,angle);
  }
  b.block(x,z,.83);
}
function paddedBench(b,x,z,angle=0){
  b.box(x,.38,z,1.18,.43,.61,C.woodDark,angle);
  b.box(x,.64,z,1.10,.16,.58,C.wine,angle);
  b.block(x,z,.64);
}
function fourPoster(b,x,z,angle=0){
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=angle;
  const mBox=(a,y,c,w,h,d,color)=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));
    m.position.set(a,y,c);g.add(m);
  };
  // Pillow at local -Z; rotation = bed angle + PI points the head
  // OUT toward the castle wall and feet INTO the circulation ring.
  mBox(0,.52,0,1.5,.3,2.18,C.woodDark);
  mBox(0,.77,0,1.32,.2,1.99,C.red);
  mBox(0,.9,-.76,1.12,.25,.35,C.cream);
  for(const dx of [-.7,.7])for(const dz of [-1.03,1.03]){
    mBox(dx,1.18,dz,.15,2.36,.15,C.wood);
    mBox(dx,2.38,dz,.2,.17,.2,C.gold);
  }
  mBox(0,2.35,0,1.55,.18,2.22,C.wood);
  for(const dx of [-.72,.72])
    mBox(dx,1.54,0,.075,1.32,1.45,C.wine);
  b.block(x,z,1.23);
  return g;
}
function addTrunk(b,x,z,angle=0){
  b.box(x,.31,z,.82,.57,.62,C.woodDark,angle);
  b.box(x,.61,z,.85,.11,.64,C.wood,angle);
  b.box(x,.46,z,.84,.08,.68,C.gold,angle);
  b.block(x,z,.46);
}
function cozyCandle(b,group,x,z){
  b.cylinder(x,.83,z,.13,.15,.24,C.woodDark);
  b.cylinder(x,1.16,z,.09,.11,.45,C.cream);
  b.cylinder(x,1.48,z,.085,.10,.16,C.fire,8);
  const lamp=new THREE.PointLight(0xffbc73,1.9,4.8,2);
  lamp.position.set(x,1.7,z);group.add(lamp);
}
function applyBedroomLayout(group,b,room,radius){
  const plan=bedroomPlan({
    radius,
    students:room.type==='legacy'?0:room.students,
    capacity:5
  });
  validateBedroomPlan(plan);
  for(const spot of plan.beds){
    if(spot.occupied){
      const bed=fourPoster(b,spot.center.x,spot.center.z,
        spot.rotation);
      bed.name='bed:occupied:'+spot.index;
      group.add(bed);
      addTrunk(b,spot.trunk.x,spot.trunk.z,spot.rotation);
    }
  }
  // Ambient furniture follows a spare sector, and never blocks the door.
  b.box(plan.desk.x,.76,plan.desk.z,1.55,.16,.82,C.wood);
  for(const dx of [-.63,.63])
    b.box(plan.desk.x+dx,.39,plan.desk.z,.12,.72,.12,C.woodDark);
  b.block(plan.desk.x,plan.desk.z,.94);
  b.box(plan.readingChair.x,.47,plan.readingChair.z,
    .69,.58,.65,C.wine);
  b.block(plan.readingChair.x,plan.readingChair.z,.49);
  for(const seat of plan.windowBenches)
    paddedBench(b,seat.x,seat.z,seat.angle+Math.PI/2);
  // A little moonlight in the actual window alcoves.
  for(const angle of [-2.5,2.5]){
    const point={x:Math.sin(angle)*(radius-1.3),
      z:Math.cos(angle)*(radius-1.3)};
    const blue=new THREE.PointLight(0x9dbdd4,1.35,4.5,2);
    blue.position.set(point.x,2.0,point.z);group.add(blue);
  }
  cozyCandle(b,group,plan.desk.x,plan.desk.z);
  return plan;
}
function applyCommonLayout(group,b,radius){
  const plan=commonPlan(radius);
  validateCommonPlan(plan);
  for(const o of plan.couches)couch(b,o.x,o.z,o.angle);
  for(const o of plan.sideTables){
    table(b,o.x,o.z,o.w,o.d);cozyCandle(b,group,o.x,o.z);
  }
  for(const o of plan.writingDesks){
    b.box(o.x,.78,o.z,1.35,.18,.80,C.wood);
    b.box(o.x,.38,o.z-.31,1.18,.65,.14,C.woodDark);
    b.block(o.x,o.z,.85);
  }
  // Even the bookcase faces follow the local tangent of the round tower.
  for(const o of plan.bookshelves)
    bookshelf(b,o.x,o.z,o.angle);
  for(const o of plan.windowSeats)
    paddedBench(b,o.x,o.z,o.angle+Math.PI/2);
  for(const o of [{x:-2.7,z:-5.9},{x:2.7,z:-5.9}]){
    // Low reading stools beside the fire, clear of the central passage.
    b.cylinder(o.x,.25,o.z,.42,.45,.48,C.wood,10);
    b.block(o.x,o.z,.46);
  }
  return plan;
}
export function buildStage(room,graph){
  const group=new THREE.Group(),obstacles=[];
  const b=makeBuilder(group,obstacles);
  const isCommon=room.key===graph.common.key;
  const isLanding=room.key===graph.landing.key;
  const isGallery=room.key===graph.gallery.key;
  const radius=isCommon?10:isLanding?7.4:isGallery?8:7.6;
  let slots,portals,fire=null,rotate,layout,bounds=null;
  if(isGallery){
    const corridor=buildGallerySpace(group,b);
    portals=corridor.portals;
    slots=corridor.architecture;
    bounds=corridor.bounds;
    rotate=corridor.setCameraYaw;
    layout={kind:'gallery',bounds};
  }else if(isLanding){
    // Rectangular portrait corridor: no fake circular second common room.
    const entrance=buildLandingSpace(group,b);
    portals=entrance.portals;
    slots=entrance.architecture;
    bounds=entrance.bounds;
    rotate=entrance.setCameraYaw;
    layout={kind:'landing',bounds};
  }else{
    slots=slotsFor(isCommon?'common':'bedroom');
    validateSlots(slots,radius);
    const rotateWalls=circularChamber(group,b,radius,slots);
    const openings=buildOpenings(group,radius,slots);
    portals=[...openings.portals];
    fire=openings.fire;
    rotate=yaw=>{rotateWalls(yaw);openings.setCameraYaw(yaw);};
    if(isCommon){
      const plan=applyCommonLayout(group,b,radius);
      layout={kind:'common',plan};
      portals.push({kind:'fire',x:0,z:-(radius-2.1),
        desc:'В камине потрескивают поленья'});
    }else{
      const plan=applyBedroomLayout(group,b,room,radius);
      layout={kind:'bedroom',
        occupied:plan.students,
        capacity:plan.capacity,
        reservedSlots:plan.beds.length,
        bedPositions:plan.beds.filter(x=>x.occupied)
          .map(x=>({...x.center})),
        centerClearance:plan.centerClearance};
    }
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
    group,obstacles,portals,radius,bounds,fire,architecture:slots,layout,
    setCameraYaw:rotate,
    dispose(){for(const res of new Set(resources))res?.dispose?.();}
  };
}
