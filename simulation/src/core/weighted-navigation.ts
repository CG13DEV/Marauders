/** [GAME] Deterministic shortest *travel-time* routing; no character memory
 * is read here. Supply only exits the actor is actually entitled to know.
 */
export type WeightedRoute={rooms:number[];minutes:number;hops:number};

export function shortestWeightedRoute(
  start:number,goal:number,
  exits:(room:number)=>readonly number[],
  minutes:(from:number,to:number)=>number|null
):WeightedRoute|null{
  if(start===goal)return {rooms:[start],minutes:0,hops:0};
  const dist=new Map<number,number>([[start,0]]);
  const hops=new Map<number,number>([[start,0]]);
  const previous=new Map<number,number>();
  const processed=new Set<number>();
  while(true){
    const choices=[...dist.entries()].filter(([id])=>!processed.has(id))
      .sort(([a,da],[b,db])=>da-db||
        (hops.get(a)??0)-(hops.get(b)??0)||a-b);
    const current=choices[0];
    if(!current)break;
    const [room,spent]=current;
    if(room===goal)break;
    processed.add(room);
    for(const next of [...new Set(exits(room))].sort((a,b)=>a-b)){
      const cost=minutes(room,next);
      if(cost===null)continue;
      if(!Number.isSafeInteger(cost)||cost<=0)
        throw new Error('Invalid weighted passage duration');
      const candidate=spent+cost;
      const candidateHops=hops.get(room)!+1;
      const old=dist.get(next);
      if(old===undefined||candidate<old||
        (candidate===old&&candidateHops<(hops.get(next)??Infinity))){
        dist.set(next,candidate);
        hops.set(next,candidateHops);
        previous.set(next,room);
      }
    }
  }
  if(!dist.has(goal))return null;
  const path=[goal];
  while(path[0]!==start){
    const parent=previous.get(path[0]!);
    if(parent===undefined)throw Error('Weighted route predecessor missing');
    path.unshift(parent);
  }
  return {rooms:path,minutes:dist.get(goal)!,hops:path.length-1};
}
export function nextWeightedRoom(
  from:number,to:number,
  exits:(room:number)=>readonly number[],
  minutes:(from:number,to:number)=>number|null
):number|null{
  return shortestWeightedRoute(from,to,exits,minutes)?.rooms[1]??null;
}
