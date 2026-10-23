/**
 * [GAME] G4.2: minimal, serializable, typed magical effect graph.
 * Deliberately not a general-purpose VM or canonical explanation of Rowling's magic.
 * The SAME interpreter executes a named spell and student compositions.
 */
export type Vec3={x:number;y:number;z:number};
export type Trajectory=
  |{kind:'hold';point:Vec3}
  |{kind:'orbit';center:Vec3;radius:number;speed:number;height:number};
export type MagicPrimitive='position_lock'|'force_feedback'|'light_emission';
export type MagicNode=
  |{kind:'levitate';controller:'position_lock'|'force_feedback';trajectory:Trajectory}
  |{kind:'light';intensity:number};
export type MagicPattern={nodes:MagicNode[]};
export type MagicObjectState={mass:number;position:Vec3;velocity:Vec3;light:number};
export type ActiveMagic={actor:number;target:number;startMinute:number;pattern:MagicPattern};
export const vec=(x:number,y:number,z:number):Vec3=>({x,y,z});
export const DEFAULT_LEVITATION:MagicPattern={nodes:[
  {kind:'levitate',controller:'position_lock',
    trajectory:{kind:'hold',point:vec(0,2,0)}}
]};
const finite=(n:number)=>typeof n==='number'&&Number.isFinite(n);
const vector=(v:Vec3)=>v!==null&&typeof v==='object'&&
  finite(v.x)&&finite(v.y)&&finite(v.z)&&
  Math.max(Math.abs(v.x),Math.abs(v.y),Math.abs(v.z))<=100;
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v)) as T;
export function isMagicPrimitive(value:unknown):value is MagicPrimitive{
  return value==='position_lock'||value==='force_feedback'||value==='light_emission';
}
/** A whitelist, not eval(); failed validation has NO side effects. */
export function validateMagicPattern(value:unknown):value is MagicPattern{
  if(value===null||typeof value!=='object')return false;
  const nodes=(value as MagicPattern).nodes;
  if(!Array.isArray(nodes)||nodes.length<1||nodes.length>3)return false;
  const kinds=new Set<string>();
  for(const n of nodes){
    if(n===null||typeof n!=='object')return false;
    if(n.kind==='light'){
      if(kinds.has('light')||!finite(n.intensity)||n.intensity<=0||n.intensity>10)return false;
      kinds.add('light');
    }else if(n.kind==='levitate'){
      if(kinds.has('levitate')||!['position_lock','force_feedback'].includes(n.controller))
        return false;
      kinds.add('levitate');
      const t=n.trajectory;
      if(!t||typeof t!=='object')return false;
      if(t.kind==='hold'){
        if(!vector(t.point))return false;
      }else if(t.kind==='orbit'){
        if(!vector(t.center)||!finite(t.radius)||t.radius<=0||t.radius>10||
           !finite(t.speed)||Math.abs(t.speed)>6||
           !finite(t.height)||Math.abs(t.height)>100)return false;
      }else return false;
    }else return false;
  }
  return true;
}
export function requiredPrimitives(pattern:MagicPattern):MagicPrimitive[]{
  return pattern.nodes.map(n=>n.kind==='light'?'light_emission':n.controller);
}
export function trajectoryPoint(trajectory:Trajectory,elapsedTicks:number):Vec3{
  if(trajectory.kind==='hold')return {...trajectory.point};
  const a=elapsedTicks*trajectory.speed;
  return vec(trajectory.center.x+trajectory.radius*Math.cos(a),
    trajectory.height,trajectory.center.z+trajectory.radius*Math.sin(a));
}
/**
 * One world-local runtime: every ten simulated minutes corresponds to one
 * *illustrative* controller update. No JS closures in saved pattern data.
 */
export function createMagicRuntime(){
  const objects=new Map<number,MagicObjectState>();
  const active=new Map<number,ActiveMagic>();
  function register(id:number,mass:number,position:Vec3):void{
    if(!Number.isFinite(mass)||mass<=0||mass>100||!vector(position)||objects.has(id))
      throw Error('Invalid magical object');
    objects.set(id,{mass,position:clone(position),velocity:vec(0,0,0),light:0});
  }
  function state(id:number):MagicObjectState|null{
    const x=objects.get(id);return x?clone(x):null;
  }
  function knowsTarget(id:number):boolean{return objects.has(id);}
  function apply(actor:number,target:number,pattern:MagicPattern,startMinute:number):void{
    if(!objects.has(target)||!validateMagicPattern(pattern)||
       !Number.isSafeInteger(startMinute))
      throw Error('Invalid magical effect');
    active.set(target,{actor,target,pattern:clone(pattern),startMinute});
    const state=objects.get(target)!;
    state.light=pattern.nodes.find(n=>n.kind==='light')?.intensity??0;
  }
  function disturb(id:number,delta:Vec3):void{
    if(!objects.has(id)||!vector(delta)||Math.max(Math.abs(delta.x),Math.abs(delta.y),Math.abs(delta.z))>6)
      throw Error('Invalid external impulse');
    const o=objects.get(id)!;
    o.position=vec(o.position.x+delta.x,o.position.y+delta.y,o.position.z+delta.z);
    o.velocity=vec(o.velocity.x+delta.x,o.velocity.y+delta.y,o.velocity.z+delta.z);
  }
  function advance(minute:number):void{
    for(const [target,effect] of active){
      const o=objects.get(target)!;
      const phase=Math.max(0,(minute-effect.startMinute)/10);
      const motion=effect.pattern.nodes.find(n=>n.kind==='levitate');
      if(!motion||motion.kind!=='levitate')continue;
      const desired=trajectoryPoint(motion.trajectory,phase);
      if(motion.controller==='position_lock'){
        o.velocity=vec(desired.x-o.position.x,desired.y-o.position.y,desired.z-o.position.z);
        o.position=desired;
      }else{
        const axis=(p:number,v:number,want:number)=>
          Math.max(-2,Math.min(2,0.65*(want-p)/Math.sqrt(o.mass)-0.5*v));
        const v=vec(axis(o.position.x,o.velocity.x,desired.x),
          axis(o.position.y,o.velocity.y,desired.y),
          axis(o.position.z,o.velocity.z,desired.z));
        o.velocity=v;
        o.position=vec(o.position.x+v.x,o.position.y+v.y,o.position.z+v.z);
      }
    }
  }
  function snapshot(){
    return {objects:[...objects.entries()].map(([id,o])=>[id,clone(o)] as [number,MagicObjectState]),
      active:[...active.values()].map(clone)};
  }
  function replace(saved:ReturnType<typeof snapshot>):void{
    if(saved.objects.length!==objects.size||saved.objects.some(([id,o])=>
      !objects.has(id)||!finite(o.mass)||o.mass!==objects.get(id)!.mass||
      !vector(o.position)||!vector(o.velocity)||!finite(o.light)||
      o.light<0||o.light>10)||saved.active.some(a=>
      !objects.has(a.target)||!Number.isSafeInteger(a.actor)||!validateMagicPattern(a.pattern)||
      !Number.isSafeInteger(a.startMinute)))
      throw Error('Invalid saved magic world');
    const oldMasses=new Map([...objects].map(([id,o])=>[id,o.mass]));
    objects.clear();active.clear();
    for(const [id,o] of saved.objects)objects.set(id,clone({...o,mass:oldMasses.get(id)!}));
    for(const a of saved.active)active.set(a.target,clone(a));
  }
  return {register,knowsTarget,state,apply,disturb,advance,snapshot,replace};
}
