/** RB-2: isolated deterministic sub-tick action timeline. No rendering authority. */
export type Leg={from:string;to:string;seconds:number};
export type ActionEvent={at:number;actor:string;kind:'start'|'arrive'|'interrupt'|'resume';room:string};
type Journey={goal:string;legs:Leg[];index:number;start:number;elapsed:number;paused:boolean};
export class ActionTimeline {
  private time=0;
  private active=new Map<string,Journey>();
  private log:ActionEvent[]=[];
  now(){return this.time;}
  events(){return this.log.map(e=>({...e}));}
  begin(actor:string,goal:string,legs:readonly Leg[]){
    if(this.active.has(actor)||!legs.length||legs.at(-1)?.to!==goal||
      legs.some((l,i)=>!Number.isSafeInteger(l.seconds)||l.seconds<1||
        (i>0&&legs[i-1]!.to!==l.from)))throw Error('Invalid journey');
    this.active.set(actor,{goal,legs:legs.map(l=>({...l})),index:0,start:this.time,elapsed:0,paused:false});
    this.log.push({at:this.time,actor,kind:'start',room:legs[0]!.from});
  }
  advance(until:number){
    if(!Number.isSafeInteger(until)||until<this.time)throw Error('Invalid time');
    while(true){
      let next=Infinity;
      for(const j of this.active.values())if(!j.paused)
        next=Math.min(next,j.start+j.legs[j.index]!.seconds-j.elapsed);
      if(next>until)break;
      this.time=next;
      const arriving=[...this.active].filter(([,j])=>!j.paused&&
        j.start+j.legs[j.index]!.seconds-j.elapsed===next)
        .sort(([a],[b])=>a.localeCompare(b));
      for(const [actor,j] of arriving){
        const room=j.legs[j.index]!.to;
        this.log.push({at:this.time,actor,kind:'arrive',room});
        j.index++;
        if(j.index===j.legs.length){this.active.delete(actor);continue;}
        j.start=this.time;j.elapsed=0;
        this.log.push({at:this.time,actor,kind:'start',room});
      }
    }
    this.time=until;
  }
  interrupt(actor:string){
    const j=this.active.get(actor);
    if(!j||j.paused)throw Error('Not moving');
    j.elapsed+=this.time-j.start;j.paused=true;
    this.log.push({at:this.time,actor,kind:'interrupt',room:j.legs[j.index]!.from});
  }
  resume(actor:string){
    const j=this.active.get(actor);
    if(!j||!j.paused)throw Error('Not interrupted');
    j.paused=false;j.start=this.time;
    this.log.push({at:this.time,actor,kind:'resume',room:j.legs[j.index]!.from});
  }
  observe(actor:string){
    const j=this.active.get(actor);
    if(!j)return null;
    const leg=j.legs[j.index]!;
    const elapsed=j.elapsed+(j.paused?0:this.time-j.start);
    return {goal:j.goal,from:leg.from,to:leg.to,progress:elapsed/leg.seconds,
      paused:j.paused,remaining:leg.seconds-elapsed};
  }
}
