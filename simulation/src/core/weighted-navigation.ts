/**
 * [GAME] Deterministic minimum-travel-time Dijkstra over an actor-permitted
 * graph. No character memories are read here: callers supply known exits.
 * #30: binary min-heap avoids repeatedly sorting the full frontier for
 * every route requested by hundreds of inhabitants.
 */
export type WeightedRoute={rooms:number[];minutes:number;hops:number};
type Frontier={room:number;minutes:number;hops:number};
const less=(a:Frontier,b:Frontier)=>a.minutes<b.minutes||
  (a.minutes===b.minutes&&(a.hops<b.hops||
    (a.hops===b.hops&&a.room<b.room)));

function push(heap:Frontier[],entry:Frontier):void{
  heap.push(entry);
  let i=heap.length-1;
  while(i>0){
    const parent=Math.floor((i-1)/2);
    if(!less(entry,heap[parent]!))break;
    heap[i]=heap[parent]!;
    i=parent;
  }
  heap[i]=entry;
}
function pop(heap:Frontier[]):Frontier|undefined{
  const first=heap[0];
  const tail=heap.pop();
  if(first===undefined||tail===undefined)return undefined;
  if(heap.length===0)return first;
  let i=0;
  while(i*2+1<heap.length){
    const left=i*2+1,right=left+1;
    const child=right<heap.length&&less(heap[right]!,heap[left]!)
      ?right:left;
    if(!less(heap[child]!,tail))break;
    heap[i]=heap[child]!;
    i=child;
  }
  heap[i]=tail;
  return first;
}

export function shortestWeightedRoute(
  start:number,goal:number,
  exits:(room:number)=>readonly number[],
  minutes:(from:number,to:number)=>number|null
):WeightedRoute|null{
  if(start===goal)return {rooms:[start],minutes:0,hops:0};
  const distances=new Map<number,number>([[start,0]]);
  const depths=new Map<number,number>([[start,0]]);
  const previous=new Map<number,number>();
  const settled=new Set<number>();
  const heap:Frontier[]=[];
  push(heap,{room:start,minutes:0,hops:0});
  while(heap.length){
    const current=pop(heap)!;
    const {room}=current;
    if(settled.has(room)||distances.get(room)!==current.minutes||
       depths.get(room)!==current.hops)continue;
    if(room===goal)break;
    settled.add(room);
    for(const next of [...new Set(exits(room))].sort((a,b)=>a-b)){
      const cost=minutes(room,next);
      if(cost===null)continue;
      if(!Number.isSafeInteger(cost)||cost<=0)
        throw Error('Invalid weighted passage duration');
      const candidate=current.minutes+cost;
      const candidateHops=current.hops+1;
      const old=distances.get(next);
      if(old===undefined||candidate<old||
         (candidate===old&&candidateHops<(depths.get(next)??Infinity))){
        distances.set(next,candidate);
        depths.set(next,candidateHops);
        previous.set(next,room);
        push(heap,{room:next,minutes:candidate,hops:candidateHops});
      }
    }
  }
  if(!distances.has(goal))return null;
  const path=[goal];
  while(path[0]!==start){
    const parent=previous.get(path[0]!);
    if(parent===undefined)throw Error('Weighted route predecessor missing');
    path.unshift(parent);
  }
  return {rooms:path,minutes:distances.get(goal)!,hops:path.length-1};
}
export function nextWeightedRoom(
  from:number,to:number,
  exits:(room:number)=>readonly number[],
  minutes:(from:number,to:number)=>number|null
):number|null{
  return shortestWeightedRoute(from,to,exits,minutes)?.rooms[1]??null;
}
