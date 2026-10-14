/** RB-3: bridge authoritative timed legs to validated world commands.
 * A room transition is committed ONLY after the leg's duration has elapsed.
 * No direct ECS mutations; the supplied execute function owns validation.
 */
import {ActionTimeline} from './action-timeline.ts';
import type {Command,CommandResult} from './Simulation.ts';

export type TimedMove={from:number;to:number;seconds:number};
export type CommittedMove={at:number;actor:number;from:number;to:number;result:CommandResult};
export class TimedWorldBridge {
  private readonly timeline=new ActionTimeline();
  /** Read-only diagnostics; callers cannot advance the authoritative timeline. */
  actionEvents(){return this.timeline.events();}
  /** Next public arrival boundary, to advance other spatial systems in order. */
  nextArrival(){this.ensureLive();return this.timeline.nextArrival();}

  private routes=new Map<number,{legs:TimedMove[];committed:number}>();
  private commits:CommittedMove[]=[];
  private processedEvents=0;
  private disabled=false;
  /** Checkpoint v2 has no sub-tick journeys. Never serialize a moving world. */
  hasInFlight(){return this.routes.size>0;}
  hasActor(actor:number){return this.routes.has(actor);}
  /**
   * A restored ECS world has a new timeline epoch. Old bridge references
   * must not be allowed to issue commands against that restored world.
   */
  invalidate(){
    this.disabled=true;
    for(const actor of this.routes.keys())this.timeline.cancel(String(actor));
    this.routes.clear();
  }
  private ensureLive(){if(this.disabled)throw Error('Timed movement bridge invalidated by restore');}
  private readonly currentRoom:(actor:number)=>number|null;
  private readonly execute:(command:Command)=>CommandResult;
  private readonly onAdvance?:(seconds:number)=>void;
  constructor(currentRoom:(actor:number)=>number|null,
    execute:(command:Command)=>CommandResult,
    onAdvance?:(seconds:number)=>void){
    this.currentRoom=currentRoom;
    this.execute=execute;
    this.onAdvance=onAdvance;
  }
  begin(actor:number,goal:number,legs:readonly TimedMove[]){
    this.ensureLive();
    if(!legs.length||legs[0]!.from!==this.currentRoom(actor)||
      legs.at(-1)!.to!==goal||legs.some((l,i)=>i>0&&legs[i-1]!.to!==l.from))
      throw Error('Invalid physical route');
    this.timeline.begin(String(actor),String(goal),legs.map(l=>({
      from:String(l.from),to:String(l.to),seconds:l.seconds
    })));
    this.routes.set(actor,{legs:legs.map(l=>({...l})),committed:0});
  }
  advance(until:number){
    this.ensureLive();
    if(!Number.isSafeInteger(until)||until<this.timeline.now())throw Error('Invalid time');
    while(true){
      const next=this.timeline.nextArrival();
      if(next===null||next>until)break;
      this.timeline.advance(next);
      this.onAdvance?.(next);
      this.commitArrivals();
    }
    this.timeline.advance(until);
    this.onAdvance?.(until);
    this.commitArrivals();
  }
  private commitArrivals(){
    // The RB-2 timeline emits arrival timestamps in deterministic order.
    // Each arrival is validated against the live world before committing.
    const history=this.timeline.events();
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
        this.timeline.cancel(String(actor));
        this.routes.delete(actor);
      }else if(route.committed===route.legs.length)this.routes.delete(actor);
    }
  }
  interrupt(actor:number){this.ensureLive();this.timeline.interrupt(String(actor));}
  resume(actor:number){this.ensureLive();this.timeline.resume(String(actor));}
  observe(actor:number){this.ensureLive();return this.timeline.observe(String(actor));}
  events(){return this.commits.map(e=>({...e}));}
}
