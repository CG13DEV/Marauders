/**
 * [FILM / GAME] The Grand Staircase Tower rather than a narrow hallway.
 * The historical ECS key west_landing_4 remains unchanged; floor numbering
 * in the main school graph is provisional, NOT the book's seventh-floor fact.
 * Decorative upper balconies are not fake room transitions.
 */
import * as THREE from 'three';
import {LANDING_SLOTS} from './architecture.js';
import {buildOpenings} from './openings.js';
import {TOWER_BOUNDS,TOWER_PORTRAIT_APPROACH,TOWER_STAIR_APPROACH,
  grandStairState} from './tower-entrance.js';

export const LANDING_BOUNDS=TOWER_BOUNDS;
export function landingPlan(){
  return {
    width:17.6,length:17.6,
    portrait:{x:0,z:-8.80},
    approach:{...TOWER_PORTRAIT_APPROACH},
    stairArrival:{...TOWER_STAIR_APPROACH},
    levels:[0,4.5,9.0,13.5],
    bounds:{...LANDING_BOUNDS}
  };
}
export function validateLandingPlan(plan){
  if(plan.width<=0||plan.length<=0||plan.levels.length<3)
    throw Error('Invalid staircase tower dimensions');
  if(plan.bounds.minZ>=plan.approach.z||
    plan.approach.z>=plan.stairArrival.z||
    plan.stairArrival.z>=plan.bounds.maxZ)
    throw Error('Disconnected portrait-to-stair route');
  if(Math.abs(plan.portrait.x)>1e-9||
    plan.portrait.z>=plan.bounds.minZ)
    throw Error('The Fat Lady must be part of the outer tower wall');
  return true;
}
const COLORS={
  stone:0x868087,deep:0x47434c,slate:0x67616b,
  gold:0xc39b58,wood:0x4b332d,
  dark:0x28212c,light:0xffc078,plaster:0x85706d
};
const portraitPalette=[0x403943,0x49333b,0x303b49,0x473d31,
  0x344336,0x4c3039,0x303d4b,0x503d46];
function picture(b,wall,side,along,y,index){
  const width=1.05+(index%3)*.23,height=1.56+(index%4)*.15;
  const backing=portraitPalette[index%portraitPalette.length];
  const x=wall==='side'?side*8.58:along;
  const z=wall==='side'?along:side*8.60;
  if(wall==='side'){
    b.box(x,y,z,.25,height+.23,width+.23,COLORS.gold);
    b.box(x-side*.13,y,z,.09,height-.12,width-.12,backing);
    b.box(x-side*.19,y-.25,z,.09,.52,.48,0x806e56);
    b.box(x-side*.21,y+.23,z,.09,.36,.29,0xc3a189);
    b.box(x-side*.21,y+.45,z,.08,.17,.43,COLORS.wood);
  }else{
    b.box(x,y,z,width+.23,height+.23,.25,COLORS.gold);
    b.box(x,y,z-side*.13,width-.12,height-.12,.09,backing);
    b.box(x,y-.25,z-side*.19,.48,.52,.09,0x806e56);
    b.box(x,y+.23,z-side*.21,.29,.36,.09,0xc3a189);
    b.box(x,y+.45,z-side*.21,.43,.17,.08,COLORS.wood);
  }
}
function movingFlight(group){
  const pivot=new THREE.Group();
  pivot.name='grand-staircase:rotating-flight';
  pivot.position.set(TOWER_STAIR_APPROACH.x,0,TOWER_STAIR_APPROACH.z);
  group.add(pivot);
  const stone=new THREE.MeshStandardMaterial({color:COLORS.slate,roughness:.94});
  const edge=new THREE.MeshStandardMaterial({color:COLORS.gold,roughness:.72,
    metalness:.25});
  const insert=(x,y,z,w,h,d,material)=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
    m.position.set(x,y,z);pivot.add(m);
  };
  // Every riser belongs to the same Y-axis pivot. Its first tread is at
  // the physical approach; elevated steps are scenery until a validated
  // ECS passage is taken. No rendered-only walking/teleporting onto treads.
  for(let i=0;i<11;i++){
    const z=.40+i*.37,y=.11+i*.29;
    insert(0,y,z,2.65,.20,.43,stone);
    insert(0,y+.12,z+.15,2.70,.07,.13,edge);
    for(const side of [-1,1]){
      insert(side*1.37,y+.50,z,.10,.92,.11,stone);
      insert(side*1.39,y+.94,z,.12,.13,.41,edge);
    }
  }
  // Pivot plinth: stationary connection into the traversable tower floor.
  return pivot;
}
export function buildLandingSpace(group,b){
  const plan=landingPlan();validateLandingPlan(plan);
  const {stone,deep,slate,gold,light}=COLORS;
  const facade={east:[],west:[],north:[],south:[]};
  // Actual ground-level floor, so approach to the portrait is unobstructed.
  b.box(0,-.35,0,17.8,.7,18.0,deep);
  b.box(0,.025,0,17.35,.07,17.35,0x655957);
  for(let x=-7.2;x<=7.2;x+=2.4)
    b.box(x,.07,0,.05,.024,16.7,slate);
  for(let z=-7.1;z<=7.1;z+=2.4)
    b.box(0,.07,z,16.7,.024,.05,slate);

  // Vertical stone shafts and arcade levels are real Three.js geometry,
  // not a backdrop image of stairs. Leave roof open for the cutaway view.
  for(const x of [-8.82,8.82]){
    facade[x>0?'east':'west'].push(
      b.box(x,7.6,0,.46,15.2,17.65,stone));
    for(const y of [3.7,8.2,12.7])
      b.box(x-Math.sign(x)*.46,y,0,.74,.23,17.5,gold);
  }
  for(const x of [-5.1,5.1]){
    // Back wall retains a central framed opening at the gallery height.
    facade.north.push(b.box(x,7.6,8.8,7.45,15.2,.47,stone));
    facade.south.push(b.box(x,7.6,-8.8,7.45,15.2,.47,stone));
  }
  for(const x of [-7.4,7.4]){
    for(const z of [-7.4,7.4]){
      b.box(x,7.4,z,.66,14.8,.66,deep);
      b.box(x,14.8,z,1.08,.30,1.08,gold);
      b.block(x,z,.43);
    }
  }
  // Floating picture-laden balconies alternate around the atrium.
  for(const y of [4.45,8.95,13.45]){
    for(const side of [-1,1]){
      b.box(side*6.9,y,0,3.3,.35,15.2,deep);
      b.box(side*5.22,y+.65,0,.16,1.28,15.2,stone);
      b.box(side*5.22,y+1.30,0,.24,.15,15.3,gold);
      for(let z=-7;z<=7;z+=1.4)
        b.box(side*5.22,y+.62,z,.20,1.2,.16,gold);
    }
    for(const z of [-6.75,6.75]){
      b.box(0,y,z,10.4,.28,2.1,slate);
      b.box(0,y+1.25,z,10.4,.13,.19,gold);
      for(let x=-4.8;x<=4.8;x+=1.2)
        b.box(x,y+.66,z,.13,1.18,.14,stone);
    }
  }
  // Static flights, in addition to the genuinely turning lower flight.
  for(const side of [-1,1]){
    for(let i=0;i<12;i++){
      const z=-3.5+i*.43;
      const y=.12+i*.34;
      b.box(side*5.7,y,z,2.05,.22,.46,i%2?stone:slate);
      b.box(side*4.56,y+.7,z,.14,1.36,.15,stone);
    }
  }
  // At least sixty individually framed portraits, rather than two windows
  // pretending to be the film's wall of paintings.
  let index=0;
  for(const y of [1.85,5.9,10.15,14.25]){
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
  const portrait=buildOpenings(group,8.8,[LANDING_SLOTS[0]]);
  // The Fat Lady alone marks a secret entrance. Other frames do not get
  // portal affordances or text that identifies Gryffindor to strangers.
  const moving=movingFlight(group);
  for(const x of [-6.9,6.9]){
    for(const z of [-6,1.5,6]){
      b.box(x,2.5,z,.23,.45,.2,gold);
      const flame=new THREE.PointLight(light,2.5,9);
      flame.position.set(x-Math.sign(x)*.55,2.7,z);group.add(flame);
    }
  }
  // The side slot IDs are intentionally retained for architecture
  // diagnostics, but these are portraits rather than corridor windows.
  return {
    bounds:plan.bounds,
    portals:[...portrait.portals,
      {kind:'stair_gallery',x:TOWER_STAIR_APPROACH.x,
        z:TOWER_STAIR_APPROACH.z,
        desc:'Поворотная лестница — исследовать путь к галерее'}],
    setCameraYaw(yaw){
      // Orbiting the cutaway must never put 15m-high front masonry over
      // the playable floor. The far facades retain their portraits.
      for(const [side,objects] of Object.entries(facade)){
        const near=side==='east'?Math.sin(yaw)>.22:
          side==='west'?Math.sin(yaw)<-.22:
          side==='north'?Math.cos(yaw)>.22:Math.cos(yaw)<-.22;
        for(const object of objects)object.visible=!near;
      }
      portrait.setCameraYaw(yaw);
    },
    setWorldSeconds(seconds){
      moving.rotation.y=grandStairState(seconds).angle;
    },
    architecture:LANDING_SLOTS,
    type:'landing'
  };
}
