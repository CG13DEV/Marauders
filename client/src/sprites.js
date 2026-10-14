/** Hand-drawn procedural 2D school-uniform sprites.
 * Eight substantially different head/body angles, four genuine walk poses.
 * Works offline: textures are Canvas2D, no licensed or downloaded assets.
 */
import * as THREE from 'three';
import {VIEWS,WALK_FRAMES,SPRITE_VARIANTS,
  directionFrame,animationFrame} from './sprite-motion.js';
const W=48,H=72;
const styles={
  player:{hair:'#51362c',hairHi:'#79503c',coat:'#35343c',
    robeHi:'#514750',scarf:'#922e43',trim:'#cda359',skin:'#e8b995'},
  ginger:{hair:'#b75e34',hairHi:'#e28c4f',coat:'#393341',
    robeHi:'#645365',scarf:'#9d3b48',trim:'#e1b15b',skin:'#f4c7a0'},
  dark:{hair:'#24212c',hairHi:'#4d4250',coat:'#302e3d',
    robeHi:'#52475e',scarf:'#923c48',trim:'#d3a864',skin:'#bb8c70'},
  blond:{hair:'#c0a06a',hairHi:'#e0c593',coat:'#353740',
    robeHi:'#555968',scarf:'#913849',trim:'#ddb767',skin:'#e7bd9b'}
};
export function paintFrame(view,stride,variant='player'){
  if(view<0||view>=VIEWS||stride<0||stride>=WALK_FRAMES)
    throw RangeError('Invalid sprite view or stride');
  const palette=styles[variant]??styles.player;
  // Different character silhouettes, not merely recoloured short hair.
  const longHair=variant==='ginger';
  const eye=longHair?'#388654':'#24202b';
  const c=document.createElement('canvas');c.width=W;c.height=H;
  const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
  const p=(x,y,w,h,color)=>{
    ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),
      Math.round(w),Math.round(h));
  };
  const moving=stride!==0;
  const step=[0,3,0,-3][stride];
  const swing=[0,-3,0,3][stride];
  const right=view===1||view===2||view===3;
  const left=view===5||view===6||view===7;
  const side=view===2||view===6;
  const behind=view===3||view===4||view===5;
  const front=view===0,back=view===4;
  const quarterFront=view===1||view===7;
  const quarterBack=view===3||view===5;
  const sideShift=right?2:left?-2:0;
  // Shadows and shoe silhouettes alternate at WALK poses 1 and 3.
  p(11,65,26,3,'rgba(20,18,24,.20)');
  p(13+step,59,8,7,'#28232c');
  p(27-step,59,8,7,'#28232c');
  p(12+step,63,11,4,'#211d26');
  p(25-step,63,11,4,'#211d26');
  // Mantle hem flares when stepping.
  p(10-(moving?2:0),40,28+(moving?4:0),20,'#211f28');
  p(13,42,22,18,palette.coat);
  p(14,42,4,16,palette.robeHi);
  p(31,42,4,16,'#292530');
  if(back||quarterBack){
    p(19,43,10,18,palette.scarf);
    p(23,43,2,18,palette.trim);
  }else if(!side){
    p(20,42,8,17,'#f0e1c7');
    p(18,42,2,16,palette.trim);
    p(28,42,2,16,palette.trim);
    p(23,44,3,12,'#b1a091');
  }else{
    p(right?27:18,42,3,16,palette.trim);
  }
  // Left/right sleeve gait is actually drawn, not applied by sprite bounce.
  const leftArm=left?-3:0,rightArm=right?3:0;
  p(8+leftArm,40+swing,7,16,palette.coat);
  p(33+rightArm,40-swing,7,16,palette.coat);
  p(8+leftArm,51+swing,6,5,palette.skin);
  p(34+rightArm,51-swing,6,5,palette.skin);
  // Tucked neck.
  p(20,34,8,8,'#b68064');
  p(21,34,7,8,palette.skin);
  // Head differences: front, 3/4, profile, back of skull.
  const hX=side?16+sideShift:14+sideShift;
  const hW=side?16:19;
  // Dark jaw backing on a ginger character read as a heavy beard.
  p(hX-1,14,hW+2,22,longHair?palette.hair:'#211d25');
  p(hX,16,hW,18,palette.hair);
  if(!back){
    p(hX+2,19,hW-3,15,palette.skin);
    if(longHair)p(hX+4,32,hW-7,5,palette.skin); // visible skin-coloured chin
    if(behind){
      // Back quarter: narrower cheek, visible hairline on far side.
      const earX=right?hX+hW-5:hX+1;
      p(earX,24,5,9,palette.skin);
      p(right?hX:hX+hW-7,19,7,18,palette.hair);
    }else if(side){
      // Profile with only one eye and a projecting nose.
      const eyeX=right?hX+hW-5:hX+3;
      p(eyeX,26,2,2,eye);
      p(right?hX+hW-1:hX-2,28,3,3,'#bc8c74');
    }else if(quarterFront){
      p(right?hX+10:hX+4,26,2,2,eye);
      p(right?hX+15:hX+10,26,2,2,eye);
    }else if(front){
      p(hX+5,26,2,2,eye);
      p(hX+13,26,2,2,eye);
      p(hX+9,31,3,1,'#b8816a');
    }
    p(hX-1,14,hW+3,8,palette.hair);
    p(hX+2,14,8,3,palette.hairHi);
    p(hX-1,18,4,12,palette.hair);
    p(hX+hW-3,18,4,12,palette.hair);
    if(longHair){
      // Shoulder-length side locks remain readable in all front profiles.
      p(hX-3,23,5,21,palette.hair);
      p(hX+hW-2,23,6,21,palette.hair);
      p(hX-2,25,2,16,palette.hairHi);
      p(hX+hW,25,2,15,palette.hairHi);
    }
  }else{
    p(hX,15,hW,19,palette.hair);
    p(hX+3,15,6,14,palette.hairHi);
    p(hX-1,28,4,9,palette.hair);
    p(hX+hW-3,28,4,9,palette.hair);
    if(longHair){
      p(hX-2,29,hW+4,16,palette.hair);
      p(hX+3,31,6,12,palette.hairHi);
    }
  }
  // Scarf and Gryffindor trim change side based on view.
  if(!back){
    p(17,37,15,4,palette.scarf);
    p(right?27:18,37,3,4,palette.trim);
    const tailX=right?28:quarterFront?16:29;
    p(tailX,40,5,12,palette.scarf);
    p(tailX,46,5,2,palette.trim);
  }
  // Wand hand projects toward the direction of travel.
  if(side)p(right?41:5,48,2,14,'#89603f');
  const texture=new THREE.CanvasTexture(c);
  texture.magFilter=THREE.NearestFilter;
  texture.minFilter=THREE.NearestFilter;
  texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
export function createAvatar({variant='player',scale=1}={}){
  if(!SPRITE_VARIANTS.includes(variant))throw Error('Unknown sprite: '+variant);
  const frames=Array.from({length:VIEWS},(_,view)=>
    Array.from({length:WALK_FRAMES},(_,stride)=>
      paintFrame(view,stride,variant)));
  const material=new THREE.SpriteMaterial({
    map:frames[0][0],transparent:true,
    depthWrite:false,alphaTest:.07
  });
  const sprite=new THREE.Sprite(material);
  sprite.scale.set(1.8*scale,2.72*scale,1);
  sprite.position.y=1.42*scale;
  const disc=new THREE.Mesh(new THREE.CircleGeometry(.54*scale,24),
    new THREE.MeshBasicMaterial({
      color:0x15131b,transparent:true,opacity:.25,depthWrite:false
    }));
  disc.rotation.x=-Math.PI/2;disc.position.y=.03;
  const group=new THREE.Group();group.add(disc,sprite);
  let selected=-1,elapsed=0;
  return {
    group,
    update(delta,moving,facing,cameraYaw){
      elapsed=moving?elapsed+delta:0;
      const view=directionFrame(facing,cameraYaw);
      const stride=animationFrame(elapsed,moving);
      const index=view*WALK_FRAMES+stride;
      if(index!==selected){
        selected=index;material.map=frames[view][stride];
        material.needsUpdate=true;
      }
      // Minimal breathing while idle: gait comes from leg/arm pixels.
      sprite.position.y=1.42*scale+
        (moving?0:Math.sin(elapsed*1.8)*.01);
      return view;
    },
    dispose(){
      frames.flat().forEach(t=>t.dispose());
      disc.geometry.dispose();disc.material.dispose();
      material.dispose();
    }
  };
}
