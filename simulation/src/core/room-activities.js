/**
 * [GAME] RB-5.3 — local room activity authority (no WebGL dependencies).
 * The world supplies affordances, inhabitants and time. The planner chooses
 * purposeful local goals, finds walkable approaches and advances positions
 * on WORLD SECONDS, never requestAnimationFrame.
 * This is an opt-in four-NPC micro-space; not full-school ECS floor physics.
 */
const STEP=0.55, SPEED=0.044;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const point=(x,z)=>({x,z});
const key=(x,z)=>x+','+z;

export function createRoomActivities({plan,actors,commonKey,nowSeconds,initialLocations}){
  if(!Number.isSafeInteger(nowSeconds)||nowSeconds<0)throw Error('Invalid room activity clock');
  const obstacles=[
    ...plan.couches.map(p=>({...p,r:1.24})),
    ...plan.sideTables.map(p=>({...p,r:.8})),
    ...plan.writingDesks.map(p=>({...p,r:1})),
    ...plan.windowSeats.map(p=>({...p,r:.74})),
    ...plan.bookshelves.map(p=>({...p,r:.83}))
  ];
  const walkable=(p)=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&
    Math.hypot(p.x,p.z)<=8.60 &&
    obstacles.every(o=>distance(p,o)>=o.r+.40);
  const actorData=new Map(actors.map(a=>[a.key,{...a}]));
  const seeds=[point(-2,1.6),point(2,1.6),point(1.6,-1.2),point(-1.6,-1.2)];
  const actorsState=new Map();
  const heading=(from,to)=>Math.atan2(to.x-from.x,to.z-from.z);
  const affordances=[
    ...plan.writingDesks.map((s,i)=>({id:'desk-'+i,kind:'read',x:s.x,z:s.z,r:1.65})),
    ...plan.bookshelves.map((s,i)=>({id:'books-'+i,kind:'read',x:s.x,z:s.z,r:1.38})),
    ...plan.windowSeats.map((s,i)=>({id:'window-'+i,kind:'observe',x:s.x,z:s.z,r:1.48})),
    ...plan.couches.map((s,i)=>({id:'sofa-'+i,kind:'rest',x:s.x,z:s.z,r:1.73})),
    {id:'fire',kind:'rest',x:0,z:-7.9,r:2.4}
  ];
  function approach(spot){
    // Choose a real walkable interaction point around the object, never its
    // collider centre. Centre-facing direction is usually the useful side.
    const candidates=Array.from({length:16},(_,i)=>{
      const angle=i*Math.PI/8;
      return point(spot.x+Math.cos(angle)*spot.r,
        spot.z+Math.sin(angle)*spot.r);
    }).filter(walkable);
    if(!candidates.length)throw Error('Unreachable affordance '+spot.id);
    candidates.sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z));
    return candidates[0];
  }
  for(const spot of affordances)spot.approach=approach(spot);
  const nodes=[],nodeIds=new Map();
  for(let x=-8.25;x<=8.25;x+=STEP)for(let z=-8.25;z<=8.25;z+=STEP){
    const p=point(Math.round(x*100)/100,Math.round(z*100)/100);
    if(!walkable(p))continue;
    nodeIds.set(key(Math.round(x/STEP),Math.round(z/STEP)),nodes.length);
    nodes.push(p);
  }
  function isClear(a,b){
    const length=distance(a,b);
    const count=Math.ceil(length/.19);
    for(let i=0;i<=count;i++){
      const t=i/count;
      if(!walkable(point(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t)))return false;
    }
    return true;
  }
  // Bounded deterministic A* on the same furniture collision circles used
  // by the visual architecture. Players and NPCs do not yet avoid each other.
  function route(from,to){
    if(!walkable(from)||!walkable(to))throw Error('Unwalkable room navigation endpoint');
    if(isClear(from,to))return [to];
    const near=(p)=>nodes.map((q,i)=>({i,d:distance(q,p)}))
      .filter(x=>x.d<1.5&&isClear(p,nodes[x.i]))
      .sort((a,b)=>a.d-b.d||a.i-b.i).slice(0,8);
    const starts=near(from),ends=new Set(near(to).map(x=>x.i));
    if(!starts.length||!ends.size)throw Error('No navigation graph endpoint');
    const g=new Map(),parent=new Map(),open=new Set();
    for(const {i,d} of starts){g.set(i,d);open.add(i);}
    let end=-1;
    for(let search=0;open.size&&search<4000;search++){
      let current=-1,best=Infinity;
      for(const i of open){
        const f=g.get(i)+distance(nodes[i],to);
        if(f<best-1e-8||(Math.abs(f-best)<=1e-8&&i<current)){
          current=i;best=f;
        }
      }
      open.delete(current);
      if(ends.has(current)){end=current;break;}
      const p=nodes[current];
      for(const [dx,dz] of [[-STEP,0],[STEP,0],[0,-STEP],[0,STEP],
                             [-STEP,-STEP],[-STEP,STEP],[STEP,-STEP],[STEP,STEP]]){
        const neighbor=nodeIds.get(key(
          Math.round((p.x+dx)/STEP),Math.round((p.z+dz)/STEP)))??-1;
        if(neighbor<0)continue;
        const q=nodes[neighbor];
        if(!isClear(p,q))continue;
        const score=g.get(current)+distance(p,q);
        if(score<(g.get(neighbor)??Infinity)-1e-8){
          g.set(neighbor,score);parent.set(neighbor,current);open.add(neighbor);
        }
      }
    }
    if(end<0)throw Error('No safe path through common room');
    const path=[to],seen=new Set();
    while(end>=0&&!seen.has(end)){
      path.unshift(nodes[end]);seen.add(end);end=parent.get(end)??-1;
    }
    // Remove redundant waypoints without crossing any obstacle.
    let previous=from,index=0;
    while(index<path.length-1){
      let furthest=index;
      for(let j=path.length-1;j>=index;j--){
        if(isClear(previous,path[j])){furthest=j;break;}
      }
      if(furthest>index)path.splice(index,furthest-index);
      previous=path[index];index++;
    }
    return path;
  }
  function initial(keyName){
    const index=[...actorData.keys()].indexOf(keyName);
    const seed=seeds[index%seeds.length];
    const x=walkable(seed)?seed:point(0,0);
    return {actor:keyName,x:x.x,z:x.z,facing:0,mode:'idle',
      activity:'idle',destination:null,waypoints:[],arrivedAt:nowSeconds,
      nextThinkAt:nowSeconds,previousSpot:null,activityCount:0};
  }
  function enter(keyName){
    if(!actorsState.has(keyName))actorsState.set(keyName,initial(keyName));
  }
  for(const [name,room] of initialLocations)if(room===commonKey)enter(name);
  function choose(actor,time){
    const person=actorData.get(actor.actor);
    const reserved=new Set([...actorsState.values()].filter(a=>a!==actor)
      .map(a=>a.destination).filter(Boolean));
    const choices=affordances.filter(s=>!reserved.has(s.id));
    if(!choices.length){actor.nextThinkAt=time+60;return;}
    let winner=null,best=Infinity;
    for(const s of choices){
      const desire=person.interest==='lessons'
        ?(s.kind==='read'?0:s.kind==='rest'?2.5:4)
        :(s.kind==='observe'?0:s.kind==='rest'?1.8:4);
      const proximity=distance(actor,s.approach)*.13;
      const repetition=s.id===actor.previousSpot?5:0;
      // Stable per-character variation without an RNG or a scripted timeline.
      const variety=(String(person.key).length+s.id.length+
        person.key.charCodeAt(0)+actor.activityCount*7)%7*.065;
      const score=desire+proximity+repetition+variety;
      if(score<best){best=score;winner=s;}
    }
    if(!winner)return;
    actor.waypoints=route(point(actor.x,actor.z),winner.approach);
    actor.destination=winner.id;
    actor.activity=winner.kind;
    actor.mode='walking';
    actor.activityCount++;
  }
  let time=nowSeconds;
  function advanceTo(until,locations,travelling=[]){
    if(!Number.isSafeInteger(until)||until<time)throw Error('Room clock cannot reverse');
    const occupants=new Set(locations.filter(([,room])=>room===commonKey)
      .map(([name])=>name));
    const journeys=new Set(travelling.map(x=>x.actor));
    for(const name of [...actorsState.keys()])if(!occupants.has(name))actorsState.delete(name);
    for(const name of occupants)if(actorData.has(name))enter(name);
    for(let second=time+1;second<=until;second++){
      for(const actor of actorsState.values()){
        if(journeys.has(actor.actor))continue;
        if(actor.mode==='idle'||(actor.mode!=='walking'&&second>=actor.nextThinkAt))
          choose(actor,second);
        if(actor.mode==='walking'){
          let travel=SPEED;
          while(travel>0&&actor.waypoints.length){
            const goal=actor.waypoints[0];
            const d=distance(actor,goal);
            if(d<=travel+1e-9){
              actor.facing=heading(actor,goal);
              actor.x=goal.x;actor.z=goal.z;
              actor.waypoints.shift();travel-=d;
            }else{
              actor.facing=heading(actor,goal);
              actor.x+=(goal.x-actor.x)/d*travel;
              actor.z+=(goal.z-actor.z)/d*travel;
              travel=0;
            }
          }
          if(!actor.waypoints.length){
            actor.mode=actor.activity;
            actor.previousSpot=actor.destination;
            actor.arrivedAt=second;
            actor.nextThinkAt=second+(actor.activity==='read'?420:
              actor.activity==='observe'?260:330);
          }
        }
      }
    }
    time=until;
  }
  function snapshot(){
    return [...actorsState.values()].map(a=>({
      actor:a.actor,x:a.x,z:a.z,facing:a.facing,mode:a.mode,
      activity:a.activity,destination:a.destination
    })).sort((a,b)=>a.actor.localeCompare(b.actor));
  }
  return Object.freeze({advanceTo,snapshot,walkable});
}
