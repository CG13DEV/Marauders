/**
 * [GAME] Fourth-floor castle gallery: the next REAL castle-layout ECS node
 * after west_landing_4. Rectangular public corridor, not a duplicate
 * circular Gryffindor chamber. Source graph: gallery_4.
 */
import * as THREE from 'three';
export const GALLERY_BOUNDS=Object.freeze({
  minX:-2.88,maxX:2.88,minZ:-5.25,maxZ:5.25
});
export const GALLERY_RETURN=Object.freeze({x:0,z:-4.65});
export function buildGallerySpace(group,b){
  const stone=0x85838a,edge=0x50505d,floor=0x625c5d,wood=0x564338,
    gold=0xb99c70,glass=0x6b8290;
  b.box(0,-.24,0,7,.48,13,edge);
  b.box(0,.035,0,6.45,.09,12.4,floor);
  for(let z=-5;z<=5;z+=2){
    b.box(0,.095,z,6.3,.012,.045,edge);
  }
  // Exit south is physically open towards the portrait landing.
  for(const side of [-1,1]){
    b.box(side*2.35,1.7,-6.32,2.2,3.4,.45,stone);
    b.box(side*2.34,1.7,6.32,2.2,3.4,.45,stone);
    const x=side*3.34;
    for(const z of [-4.6,-1.55,1.5,4.55]){
      b.box(x,1.72,z,.36,3.44,2.55,stone);
    }
    for(const z of [-3.05,0,3.05]){
      // Glass arches give the gallery its own identity, with luminous
      // pockets in the masonry rather than fake playable openings.
      b.box(x,1.9,z,.13,1.55,.68,glass);
      b.box(x,2.75,z,.4,.13,.9,gold);
    }
    for(const z of [-4.5,1.5,4.5]){
      b.box(side*2.87,1.25,z,.16,.90,.15,gold);
      const flame=new THREE.PointLight(0xffbd75,1.7,4.2);
      flame.position.set(side*2.6,1.65,z);group.add(flame);
    }
  }
  b.box(0,3.3,-6.35,2.45,.38,.55,stone);
  b.box(0,3.3,6.35,2.45,.38,.55,stone);
  // An inhabited, readable space: framed portraits along the stone wall.
  for(const z of [-2.65,0,2.65]){
    b.box(-3.04,1.85,z,.25,1.35,.92,wood);
    b.box(-2.89,1.85,z,.12,1.02,.65,gold);
  }
  // Right wing opens toward the rest of Hogwarts beyond this prototype.
  // Do not fabricate a simulated door until its world topology is connected.
  return {
    bounds:{...GALLERY_BOUNDS},
    portals:[{kind:'return_landing',x:GALLERY_RETURN.x,z:GALLERY_RETURN.z,
      desc:'Вернуться к портрету Полной Дамы'}],
    architecture:[{kind:'gallery',description:'Четвёртый этаж · галерея'}],
    setCameraYaw(){},
    type:'gallery'
  };
}
