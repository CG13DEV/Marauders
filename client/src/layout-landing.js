/**
 * [FILM / GAME] Walkable split-level Grand Staircase Tower.
 *
 * A stone lower atrium is at y=0 (west_landing_3); the Fat Lady
 * occupies y=4.5 (west_landing_4). A rotating, genuinely traversable
 * flight connects the two existing authoritative ECS rooms.
 *
 * Large rails and decorative upper floors cut away on the camera's near
 * side, leaving an unobstructed view of the avatar / lower staircase.
 */
import * as THREE from 'three';
import {LANDING_SLOTS} from './architecture.js';
import {buildOpenings} from './openings.js';
import {TOWER_BOUNDS,TOWER_PORTRAIT_APPROACH,
  STAIR_BASE,STAIR_TOP,STAIR_LENGTH,UPPER_LEVEL,
  UPPER_GALLERY_PORTAL,LOWER_GALLERY_PORTAL,grandStairState}
  from './tower-entrance.js';

export const LANDING_BOUNDS=TOWER_BOUNDS;
export function landingPlan(){
  return {width:17.6,length:17.6,
    portrait:{x:0,z:-8.80,y:UPPER_LEVEL},
    approach:{...TOWER_PORTRAIT_APPROACH},
    stairArrival:{...STAIR_TOP},
    stairBase:{...STAIR_BASE},
    levels:[0,UPPER_LEVEL,9.0,13.5],
    bounds:{...LANDING_BOUNDS}};
}
export function validateLandingPlan(plan){
  if(plan.width<=0||plan.length<=0||plan.levels.length<3)
    throw Error('Invalid staircase tower dimensions');
  if(plan.bounds.minZ>=plan.approach.z||
    plan.approach.z>=plan.stairArrival.z||
    plan.stairArrival.z>=plan.bounds.maxZ)
    throw Error('Disconnected portrait-to-stair route');
  if(Math.abs(plan.portrait.x)>1e-9||
    plan.portrait.z>=plan.bounds.minZ||plan.portrait.y<=0)
    throw Error('Fat Lady must be on an elevated outer wall');
  return true;
}
const P={stone:0x868087,deep:0x47434c,slate:0x67616b,
  gold:0xc39b58,wood:0x4b332d,light:0xffc078};
const portraitPalette=[0x403943,0x49333b,0x303b49,0x473d31,
  0x344336,0x4c3039,0x303d4b,0x503d46];
function picture(b,wall,side,along,y,index){
  const width=1.05+(index%3)*.23,height=1.56+(index%4)*.15;
  const backing=portraitPalette[index%portraitPalette.length];
  const x=wall==='side'?side*8.58:along;
  const z=wall==='side'?along:side*8.60;
  if(wall==='side'){
    b.box(x,y,z,.25,height+.23,width+.23,P.gold);
    b.box(x-side*.13,y,z,.09,height-.12,width-.12,backing);
    b.box(x-side*.19,y-.25,z,.09,.52,.48,0x806e56);
    b.box(x-side*.21,y+.23,z,.09,.36,.29,0xc3a189);
  }else{
    b.box(x,y,z,width+.23,height+.23,.25,P.gold);
    b.box(x,y,z-side*.13,width-.12,height-.12,.09,backing);
    b.box(x,y-.25,z-side*.19,.48,.52,.09,0x806e56);
    b.box(x,y+.23,z-side*.21,.29,.36,.09,0xc3a189);
  }
}
function movingFlight(group){
  const pivot=new THREE.Group();
  pivot.name='grand-staircase:walkable-moving-flight';
  pivot.position.set(STAIR_BASE.x,0,STAIR_BASE.z);
  group.add(pivot);
  const stone=new THREE.MeshStandardMaterial({color:P.slate,roughness:.93});
  const gold=new THREE.MeshStandardMaterial({color:P.gold,roughness:.7});
  function insert(x,y,z,w,h,d,m){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);
    mesh.position.set(x,y,z);pivot.add(mesh);
  }
  const steps=15;
  for(let i=0;i<steps;i++){
    // Each tread has a real corresponding continuous walk surface in
    // stairPoint(t); the avatar rises instead of sliding on the floor.
    const t=(i+.5)/steps;
    const z=t*STAIR_LENGTH,y=t*UPPER_LEVEL-.11;
    insert(0,y,z,1.90,.22,STAIR_LENGTH/steps+.025,stone);
    for(const side of [-1,1]){
      insert(side*.98,y+.49,z,.11,1,.12,stone);
      insert(side*.98,y+.98,z,.13,.10,STAIR_LENGTH/steps+.04,gold);
    }
  }
  return pivot;
}
export function buildLandingSpace(group,b,{floor=4}={}){
  const plan=landingPlan();validateLandingPlan(plan);
  const facade={east:[],west:[],north:[],south:[]};
  const nearRails=[];
  // Public lower floor (model floor three).
  b.box(0,-.35,0,17.8,.70,18,P.deep);
  b.box(0,.025,0,17.30,.07,17.30,0x655957);
  for(let x=-7.2;x<=7.2;x+=2.4)
    b.box(x,.075,0,.05,.015,16.7,P.slate);
  for(let z=-7.1;z<=7.1;z+=2.4)
    b.box(0,.075,z,16.7,.015,.05,P.slate);

  for(const x of [-8.82,8.82])
    facade[x>0?'east':'west'].push(
      b.box(x,7.6,0,.46,15.2,17.65,P.stone));
  for(const x of [-5.1,5.1]){
    facade.north.push(b.box(x,7.6,8.8,7.45,15.2,.47,P.stone));
    facade.south.push(b.box(x,7.6,-8.8,7.45,15.2,.47,P.stone));
  }
  for(const x of [-7.4,7.4])for(const z of [-7.4,7.4]){
    b.box(x,7.4,z,.65,14.8,.65,P.deep);
    b.block(x,z,.43);
  }
  // Upper walkable gallery of the Fat Lady, a slender L rather than
  // the giant solid horizontal bridges that blocked the entire view.
  // From the portrait: west along south edge, then north along west edge,
  // arriving at the upper end of the pivoting flight.
  const upperDeck=new THREE.Group();
  upperDeck.name='upper-landing:walkable';
  group.add(upperDeck);
  function deckBox(x,y,z,w,h,d,color){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),
      new THREE.MeshStandardMaterial({color,roughness:.95}));
    mesh.position.set(x,y,z);upperDeck.add(mesh);return mesh;
  }
  deckBox(-2.60,UPPER_LEVEL-.13,-6.62,8.1,.27,2.0,P.deep);
  deckBox(-5.65,UPPER_LEVEL-.13,-1.35,2.1,.27,10.65,P.deep);
  deckBox(-5.65,UPPER_LEVEL-.13,3.5,2.1,.27,1.9,P.deep);
  deckBox(0,UPPER_LEVEL-.13,-4.6,1.85,.27,4.0,P.deep);
  // Non-blocking low rail on the interior edge, not across the path.
  const rail=deckBox(-4.54,UPPER_LEVEL+.72,-.95,.14,1.40,10.25,P.gold);
  nearRails.push(rail);
  for(let z=-5.45;z<=3.65;z+=1.1)
    nearRails.push(deckBox(-4.54,UPPER_LEVEL+.65,z,.13,1.1,.13,P.stone));

  // Far upper balconies suggest the huge film tower but never float across
  // the centre of the view or masquerade as playable horizontal surfaces.
  for(const y of [9,13.5]){
    for(const x of [-7.0,7.0]){
      const m=b.box(x,y,0,2.6,.32,15.0,P.deep);
      facade[x>0?'east':'west'].push(m);
    }
  }
  let index=0;
  for(const y of [1.8,5.9,10.2,14]){
    for(const z of [-6.5,-4.1,-1.7,.7,3.1,5.5]){
      let prev=group.children.length;
      picture(b,'side',-1,z,y,index++);
      facade.west.push(...group.children.slice(prev));
      prev=group.children.length;
      picture(b,'side',1,z,y,index++);
      facade.east.push(...group.children.slice(prev));
    }
    for(const x of [-6.55,-4.2,4.2,6.55]){
      let prev=group.children.length;
      picture(b,'end',-1,x,y,index++);
      facade.south.push(...group.children.slice(prev));
      prev=group.children.length;
      picture(b,'end',1,x,y,index++);
      facade.north.push(...group.children.slice(prev));
    }
  }
  // The Fat Lady is at y=4.5: upper Gryffindor entrance, NOT the
  // floor where the player arrives from the outside of the castle.
  const portraitMount=new THREE.Group();
  portraitMount.position.y=UPPER_LEVEL;
  group.add(portraitMount);
  const portrait=buildOpenings(portraitMount,8.8,[LANDING_SLOTS[0]]);
  const moving=movingFlight(group);
  for(const x of [-6.9,6.9])for(const z of [-6,1.5,6]){
    b.box(x,2.5,z,.23,.45,.2,P.gold);
    const flame=new THREE.PointLight(P.light,2.2,9);
    flame.position.set(x-Math.sign(x)*.55,2.7,z);group.add(flame);
  }
  const upper=floor===4;
  // Only authentic adjacent ECS routes are exposed for this floor.
  const portals=upper
    ?[...portrait.portals.map(p=>({...p,x:TOWER_PORTRAIT_APPROACH.x,
        z:TOWER_PORTRAIT_APPROACH.z})),
      {kind:'stair_gallery',x:UPPER_GALLERY_PORTAL.x,
        z:UPPER_GALLERY_PORTAL.z,
        desc:'Галерея верхней площадки'},
      {kind:'stair_descent',x:STAIR_TOP.x,z:STAIR_TOP.z,
        desc:'Ступеньки вниз — иди по лестнице'}]
    :[{kind:'lower_gallery',x:LOWER_GALLERY_PORTAL.x,
        z:LOWER_GALLERY_PORTAL.z,
        desc:'Галерея нижнего уровня'},
      {kind:'stair_ascent',x:STAIR_BASE.x,z:STAIR_BASE.z,
        desc:'Ступеньки вверх — иди по лестнице'}];
  return {
    bounds:plan.bounds,portals,
    setCameraYaw(yaw){
      // Both the high masonry and its portrait frames disappear on the
      // CAMERA-NEAR side. The player remains unobscured in a 360° orbit.
      for(const [side,objects] of Object.entries(facade)){
        const near=side==='east'?Math.sin(yaw)>.18:
          side==='west'?Math.sin(yaw)<-.18:
          side==='north'?Math.cos(yaw)>.18:Math.cos(yaw)<-.18;
        for(const object of objects)object.visible=!near;
      }
      portrait.setCameraYaw(yaw);
      const hideRail=Math.sin(yaw)<-.18;
      for(const item of nearRails)item.visible=!hideRail;
    },
    setWorldSeconds(seconds){
      moving.rotation.y=grandStairState(seconds).angle;
    },
    architecture:LANDING_SLOTS,
    type:'landing',
    floor,
    levels:plan.levels,
    portraitHeight:UPPER_LEVEL
  };
}
