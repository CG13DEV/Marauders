/** RB-3: bridge authoritative timed legs to validated world commands.
 * A room transition is committed ONLY after the leg's duration has elapsed.
 * No direct ECS mutations; the supplied execute function owns validation.
 */
import {ActionTimeline} from './action-timeline.ts';
import type {Command,CommandResult} from './Simulation.ts';

export type TimedMove={from:number;to:number;seconds:number};
export type CommittedMove={at:number;actor:number;from:number;to:number;result:CommandResult};
export class TimedWorldBridge {
  readonly clock=new ActionTimeline();
  private routes=new Map<number,{legs:TimedMove[];committed:number}>();
  private commits:CommittedMove[]=[];
  private processedEvents=0;
  private readonly currentRoom:(actor:number)=>number|null;
  private readonly execute:(command:Command)=>CommandResult;
  constructor(currentRoom:(actor:number)=>number|null,
    execute:(command:Command)=>CommandResult){
    this.currentRoom=currentRoom;
    this.execute=execute;
  }
  begin(actor:number,goal:number,legs:readonly TimedMove[]){
    if(!legs.length||legs[0]!.from!==this.currentRoom(actor)||
      legs.at(-1)!.to!==goal||legs.some((l,i)=>i>0&&legs[i-1]!.to!==l.from))
      throw Error('Invalid physical route');
    this.clock.begin(String(actor),String(goal),legs.map(l=>({
      from:String(l.from),to:String(l.to),seconds:l.seconds
    })));
    this.routes.set(actor,{legs:legs.map(l=>({...l})),committed:0});
  }
  advance(until:number){
    this.clock.advance(until);
    // The RB-2 timeline emits arrival timestamps in deterministic order.
    // Each arrival is validated against the live world before committing.
    const history=this.clock.events();
    const arrivals=history.slice(this.processedEvents).filter(e=>e.kind==='arrive')
      .sort((a,b)=>a.at-b.at||a.actor.localeCompare(b.actor));
    this.processedEvents=history.length;
    for(const event of arrivals){
      const actor=Number(event.actor);
      const route=this.routes.get(actor);
      if(!route)continue;
      const leg=route.legs[route.committed];
      if(!leg)continue;
      const result:CommandResult=this.currentRoom(actor)===leg.from
        ?this.execute({type:'move',actor,destination:leg.to})
        :{ok:false,reason:'unknown_passage',events:[]};
      this.commits.push({at:event.at,actor,from:leg.from,to:leg.to,result});
      route.committed++;
      if(!result.ok){
        // This first bridge detects rejection, but does not yet cancel
        // downstream scheduled legs. A production integration must do so.
        this.routes.delete(actor);
      }else if(route.committed===route.legs.length)this.routes.delete(actor);
    }
  }
  interrupt(actor:number){this.clock.interrupt(String(actor));}
  resume(actor:number){this.clock.resume(String(actor));}
  observe(actor:number){return this.clock.observe(String(actor));}
  events(){return this.commits.map(e=>({...e}));}
}
