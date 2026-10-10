/** Eight distinct pixel-art orientations on a camera-facing THREE.Sprite.
 * All frames are painted locally from primitive pixels: no licensed art.
 */
import * as THREE from 'three';
const N=8, W=40,H=64;
const palette={
  outline:'#201923',robe:'#35343d',robeLit:'#514953',shirt:'#eee0c9',
  gold:'#bf9555',red:'#8e3543',skin:'#ebbf93',
  skinShadow:'#bd8a6e',hair:'#58372c',hairLight:'#81503b',
  boots:'#30252b',eyes:'#24212a',shadow:'#15141c'
};
const PIX=2;
function paintFrame(view){
  const c=document.createElement('canvas');c.width=W;c.height=H;
  const ctx=c.getContext('2d');
  ctx.imageSmoothingEnabled=false;
  const p=(x,y,w,h,col)=>{ctx.fillStyle=col;ctx.fillRect(
    Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
  // view = 0 front, 2 right profile, 4 back, 6 left profile.
  const front=view===0,back=view===4;
  const left=view>=5&&view<=7,right=view>=1&&view<=3;
  const side=view===2||view===6;
  const quarter=view===1||view===7||view===3||view===5;
  const lean=right?1:left?-1:0;
  const face=front||quarter;
  // soft ground pixel cluster
  p(9,59,22,3,'rgba(24,21,23,.35)');
  // cloak hems / boots
  p(11,54,8,7,palette.boots);p(22,54,8,7,palette.boots);
  p(9,35,23,21,palette.outline);
  p(11,37,19,18,palette.robe);
  p(12,39,2,12,palette.robeLit);
  p(26,39,2,12,'#2a2a31');
  if(back){
    p(16,38,8,16,palette.red);p(18,38,4,14,palette.gold);
  }else if(!side){
    p(18,38,4,14,palette.shirt);
    p(16,38,2,12,palette.gold);
    p(22,38,2,12,palette.gold);
  }else {
    p(lean>0?22:17,39,2,13,palette.gold);
  }
  // arms with some asymmetry
  p(7,38,5,14,palette.robe);p(29,38,5,14,palette.robe);
  p(8,48,4,4,palette.skinShadow);p(29,48,4,4,palette.skin);
  // neck
  p(17,31,7,8,palette.skinShadow);
  p(16+lean,29,8,9,palette.skin);
  // face / hair. Every direction shifts the visible anatomy.
  const headLeft=side?15+lean*2:12;
  const headWidth=side?14:17;
  p(headLeft-1,14,headWidth+3,20,palette.outline);
  p(headLeft,16,headWidth,16,back?palette.hair:palette.skin);
  if(back){
    p(headLeft,15,headWidth,14,palette.hair);
    p(headLeft+3,15,5,13,palette.hairLight);
  }else{
    p(headLeft-1,13,headWidth+2,8,palette.hair);
    p(headLeft-1,18,4,9,palette.hair);
    p(headLeft+headWidth-3,18,4,9,palette.hair);
    p(headLeft+2,14,8,3,palette.hairLight);
    if(front){
      p(17,24,2,2,palette.eyes);p(24,24,2,2,palette.eyes);
      p(20,29,3,1,palette.skinShadow);
    }else if(side){
      const eyeX=right?headLeft+headWidth-5:headLeft+3;
      p(eyeX,24,2,2,palette.eyes);
      p(right?headLeft+headWidth-1:headLeft-1,27,2,3,palette.skinShadow);
    }else if(face){
      if(view===1||view===7){
        p(lean>0?21:18,24,2,2,palette.eyes);
        p(lean>0?26:23,24,2,2,palette.eyes);
      }else{
        p(lean>0?26:15,24,2,2,palette.eyes);
        p(lean>0?27:14,25,1,3,palette.skinShadow);
      }
    }
  }
  // Gryffindor scarf
  p(16,36,11,4,palette.red);p(21,36,3,4,palette.gold);
  if(!back){p(24,40,4,11,palette.red);p(24,44,4,2,palette.gold);}
  // Tiny wand on side
  if(right)p(34,43,2,14,'#86613c');
  if(left)p(4,43,2,14,'#86613c');
  const tex=new THREE.CanvasTexture(c);
  tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.NearestFilter;
  tex.colorSpace=THREE.SRGBColorSpace;
  return tex;
}
export function createAvatar(){
  const textures=Array.from({length:N},(_,i)=>paintFrame(i));
  const material=new THREE.SpriteMaterial({
    map:textures[0],transparent:true,depthWrite:false,alphaTest:0.08
  });
  const sprite=new THREE.Sprite(material);
  sprite.scale.set(1.52,2.45,1);
  sprite.position.y=1.3;
  const disc=new THREE.Mesh(new THREE.CircleGeometry(.58,24),
    new THREE.MeshBasicMaterial({color:0x101015,transparent:true,opacity:.24,
      depthWrite:false}));
  disc.rotation.x=-Math.PI/2;disc.position.y=.025;
  const group=new THREE.Group();group.add(disc,sprite);
  let view=0,phase=0;
  return {
    group,
    update(delta,moving,facing,cameraYaw){
      if(moving)phase+=delta*11;
      else phase=0;
      // Facing relative to the viewer, snapped to eight actual frames.
      const angleToViewer=cameraYaw;
      const difference=((facing-angleToViewer+Math.PI*2)%(Math.PI*2));
      const next=Math.round(difference/(Math.PI/4))%N;
      if(next!==view){view=next;material.map=textures[view];material.needsUpdate=true;}
      sprite.position.y=1.3+(moving?Math.abs(Math.sin(phase))*.055:0);
      disc.scale.setScalar(moving?1.06:1);
      return view;
    },
    dispose(){
      textures.forEach(t=>t.dispose());
      material.dispose();
      disc.geometry.dispose();disc.material.dispose();
    }
  };
}
