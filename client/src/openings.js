/** [GAME] Built-in architectural elements, oriented by the SAME radial
 * coordinate frame as the surrounding masonry. No freestanding door kiosks.
 * Local +X = toward the room; local Z = tangent of the round tower.
 */
import * as THREE from 'three';
import {roomAnchor} from './architecture.js';
import {onCameraSide} from './wall-geometry.js';

const P={
  stone:0x868388,deep:0x55545c,shadow:0x302c32,
  gold:0xc69b54,wood:0x5a3829,velvet:0x813845,glass:0x789aaa
};
const material=(color,other={})=>new THREE.MeshStandardMaterial({
  color,roughness:.88,...other
});
function mesh(parent,x,y,z,sx,sy,sz,color,other={}){
  const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),
    material(color,other));
  m.position.set(x,y,z);parent.add(m);return m;
}
function circular(parent,x,y,z,r,h,color,sides=20){
  const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,sides),
    material(color));m.position.set(x,y,z);parent.add(m);return m;
}
function label(parent,text,y=3.6){
  const canvas=document.createElement('canvas');
  canvas.width=320;canvas.height=75;
  const c=canvas.getContext('2d');
  c.clearRect(0,0,320,75);
  c.fillStyle='#32252a';c.fillRect(5,4,310,66);
  c.lineWidth=4;c.strokeStyle='#ad844c';c.strokeRect(7,6,306,62);
  c.fillStyle='#f1ddb0';c.font='bold 24px Georgia';
  c.textAlign='center';c.fillText(text,160,47,295);
  const tex=new THREE.CanvasTexture(canvas);
  tex.colorSpace=THREE.SRGBColorSpace;
  const s=new THREE.Sprite(new THREE.SpriteMaterial({
    map:tex,transparent:true,depthWrite:false
  }));
  // Sign inside the actual arch, never at the scene origin.
  s.scale.set(2.25,.54,1);s.position.set(.34,y,0);
  parent.add(s);
}
function masonryArch(parent,width,heading){
  const half=width/2;
  // Solid stone jambs at the two sides of the OPENING in the ring.
  for(const side of [-1,1]){
    mesh(parent,.02,1.49,side*(half+.16),
      .67,3,.43,P.deep);
    mesh(parent,.13,2.8,side*(half+.19),
      .85,.27,.58,P.stone);
  }
  mesh(parent,.06,3.14,0,.66,.48,width+.56,P.stone);
  mesh(parent,.16,3.36,0,.73,.24,.65,P.gold);
  if(heading)label(parent,heading);
}
function leadedWindow(parent,width){
  const w=Math.min(width-.18,1.55);
  // True opening: below-sill stone and above-glass lintel, but no
  // 3.25m stone panel behind the coloured panes.
  mesh(parent,.03,.45,0,.48,.9,width+.25,P.deep);
  mesh(parent,.03,3.07,0,.51,.4,width+.25,P.stone);
  mesh(parent,.28,1.80,0,.095,1.92,w,P.glass,{
    transparent:true,opacity:.84,
    emissive:0x26435a,emissiveIntensity:.25
  });
  for(const z of [-w/2,w/2]){
    mesh(parent,.35,1.80,z,.19,2.02,.20,P.wood);
  }
  mesh(parent,.35,1.8,0,.19,2.01,.11,P.wood);
  for(const y of [1.3,2.25])
    mesh(parent,.37,y,0,.17,.095,w+.14,P.wood);
  mesh(parent,.43,.97,0,.62,.18,width+.43,P.stone);
  mesh(parent,.10,2.83,0,.56,.22,width+.38,P.stone);
}
function portraitPanel(parent,width){
  masonryArch(parent,width,'ТОЛСТАЯ ДАМА');
  // Panel is hinged within the wall thickness (not a freestanding stand).
  mesh(parent,.14,1.42,0,.22,2.61,width-.48,P.wood);
  mesh(parent,.32,1.55,0,.08,2.23,width-.82,P.gold);
  mesh(parent,.39,1.58,0,.047,1.97,width-1.05,P.velvet);
  // Original symbolic portrait: hat, hair and gilded dress silhouette.
  mesh(parent,.43,2.03,0,.06,.45,.47,0xe3b98f);
  mesh(parent,.47,2.30,0,.08,.22,.78,P.wood);
  mesh(parent,.45,1.27,0,.08,.91,1.02,P.gold);
  circular(parent,.15,.03,0,.94,.08,P.deep);
}
function passage(parent,width,caption){
  masonryArch(parent,width,caption);
  // A recessed vestibule goes BEYOND the wall, rather than sitting on
  // the common-room floor. It has its own threshold and side cheeks.
  mesh(parent,-.9,-.02,0,2.8,.21,width-.20,P.deep);
  mesh(parent,.12,.04,0,1.18,.12,width+.48,P.gold);
  for(const side of [-1,1]){
    mesh(parent,-1.04,1.50,side*(width/2+.13),
      2.25,3,.28,P.stone);
  }
}
function stairTower(parent,width,wing){
  passage(parent,width,wing==='boys'?'МАЛЬЧИКИ':'ДЕВОЧКИ');
  const cx=-3.04;
  circular(parent,cx,-.13,0,2.17,.31,P.deep,24);
  circular(parent,cx,.13,0,1.86,.18,P.wood,24);
  circular(parent,cx,1.35,0,.16,2.6,P.stone,10);
  const offset=wing==='boys'?.5:-.7;
  for(let i=0;i<13;i++){
    const a=offset+i*.35;
    const step=mesh(parent,cx+Math.cos(a)*1.1,.24+i*.17,
      Math.sin(a)*1.1,.96,.22,.82,P.stone);
    step.rotation.y=a;
  }
  // A short outer wall suggests a distinct stairwell outside this room.
  for(let i=0;i<19;i++){
    const a=-Math.PI*.88+i*(Math.PI*1.76/18);
    const z=Math.sin(a)*2.14,x=cx-Math.cos(a)*2.14;
    const wall=mesh(parent,x,.97,z,.27,1.95,.74,P.deep);
    wall.rotation.y=a;
  }
}
function hearth(parent,width){
  // Same frame as the curved wall: +X faces the player inside the room.
  mesh(parent,-.05,1.25,0,.62,2.5,width,P.deep);
  mesh(parent,.34,1.17,0,.13,1.85,width-1.05,P.shadow);
  mesh(parent,.44,.24,0,1.12,.30,width-.6,P.stone);
  for(const z of [-width/2+.3,width/2-.3])
    mesh(parent,.48,1.38,z,.64,2.77,.42,P.stone);
  mesh(parent,.46,2.75,0,.90,.42,width+.3,P.stone);
  mesh(parent,.40,3.22,0,1.25,.22,width+.52,P.deep);
  const flame=new THREE.Mesh(new THREE.IcosahedronGeometry(.53,0),
    new THREE.MeshBasicMaterial({color:0xffa43b}));
  flame.scale.set(.55,1.3,.9);
  flame.position.set(.66,.80,0);parent.add(flame);
  const glow=new THREE.PointLight(0xffae69,12,7,2);
  glow.position.set(1.6,1.5,0);parent.add(glow);
  return {flame,glow};
}
export function buildOpenings(group,radius,slots){
  const decorations=[];
  const portals=[];
  let fire=null;
  for(const slot of slots){
    const point=roomAnchor(radius,slot.angle);
    const mount=new THREE.Group();
    mount.name='wall-slot:'+slot.id;
    mount.position.set(point.x,0,point.z);
    mount.rotation.y=slot.angle+Math.PI/2;
    group.add(mount);
    const high=new THREE.Group();mount.add(high);
    if(slot.type==='portrait'){
      // The COMMON-room opening is an arch into the internal vestibule.
      // The Fat Lady herself is OUTSIDE at the Grand Staircase facade,
      // never duplicated inside the circular lounge.
      if(slot.portal==='outside')passage(high,slot.width,'В ТАМБУР');
      else portraitPanel(high,slot.width);
    }
    else if(slot.type==='door')passage(high,slot.width,'В ГОСТИНУЮ');
    else if(slot.type==='stair')stairTower(high,slot.width,slot.wing);
    else if(slot.type==='window')leadedWindow(high,slot.width);
    else if(slot.type==='fireplace')fire=hearth(high,slot.width);
    // Portal threshold is low and always visible after camera cutaway.
    if(slot.portal){
      mesh(mount,.44,.015,0,1.30,.09,slot.width-.22,P.deep);
      const foot=roomAnchor(radius,slot.angle,2.08);
      portals.push({
        kind:slot.portal,wing:slot.wing,
        x:foot.x,z:foot.z,
        desc:slot.portal==='wing'
          ?'Проход к лестнице '+(slot.wing==='boys'?'мальчиков':'девочек')
          :slot.portal==='outside'
            ?'Портрет Толстой дамы — выйти в коридор'
            :'Пройти в гостиную'
      });
    }
    decorations.push({slot,high});
  }
  return {
    portals,fire,
    setCameraYaw(yaw){
      for(const {slot,high}of decorations){
        // Inner facade disappears on the near-side cutaway. In the
        // far wall, all frames and alcoves are embedded in the ring.
        const frame={normalX:Math.sin(slot.angle),
          normalZ:Math.cos(slot.angle)};
        high.visible=slot.type==='stair'||slot.type==='portrait'||slot.type==='door'||!onCameraSide(frame,yaw);
      }
    }
  };
}
