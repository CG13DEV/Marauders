/**
 * [GAME] Experimental science — a character's private research notes.
 * No stored hypothesis is promoted to the original structure of a named spell.
 * Evidence is actual observed world state, never a spell-source oracle.
 */
import type {SpellId} from './spellcraft.ts';
import type {MagicPattern,Vec3} from './magic-graph.ts';

export type MagicMeasurement={position:Vec3;light:number};
export type MagicTrial={
  object:number; startMinute:number; observedMinute:number;
  before:MagicMeasurement; after:MagicMeasurement;
};
export type MagicHypothesis={
  id:number;spell:SpellId;title:string;pattern:MagicPattern;
  proposedMinute:number;trials:MagicTrial[];
};
export type PendingMagicTrial={
  hypothesisId:number;object:number;startMinute:number;before:MagicMeasurement
};
export type ResearchRecord=[number,MagicHypothesis[]];
export type ActiveResearchRecord=[number,PendingMagicTrial];
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v)) as T;
export function validHypothesisTitle(x:string):boolean{
  return typeof x==='string'&&x.trim().length>=1&&x.trim().length<=90;
}
/** Read-only arithmetic over evidence. Never outputs "original pattern found". */
export function compareMagicEvidence(a:MagicTrial,b:MagicTrial){
  const distance=(x:Vec3,y:Vec3)=>Math.hypot(x.x-y.x,x.y-y.y,x.z-y.z);
  return {
    displacementA:distance(a.before.position,a.after.position),
    displacementB:distance(b.before.position,b.after.position),
    observationDistance:distance(a.after.position,b.after.position),
    brightnessDifference:Math.abs(a.after.light-b.after.light),
    sameObservedPosition:distance(a.after.position,b.after.position)<0.01
  };
}
/**
 * The notebook is world-local; arbitrary callers cannot write fabricated trials.
 * Only the authoritative Simulation validates environment and commits evidence.
 */
export function createMagicResearch(){
  const research=new Map<number,MagicHypothesis[]>();
  const active=new Map<number,PendingMagicTrial>();

  function register(actor:number){if(research.has(actor))throw Error('Research owner duplicated');
    research.set(actor,[]);}
  function owns(actor:number,id:number){
    return research.get(actor)?.find(h=>h.id===id)??null;
  }
  function history(actor:number):MagicHypothesis[]{return clone(research.get(actor)??[]);}
  function pending(actor:number):PendingMagicTrial|null{
    const trial=active.get(actor);return trial?clone(trial):null;
  }
  function draft(actor:number,spell:SpellId,title:string,pattern:MagicPattern,minute:number){
    const ledger=research.get(actor);
    if(!ledger)throw Error('Unknown research owner');
    if(ledger.length>=24)throw Error('Research capacity reached');
    const hypothesis:MagicHypothesis={id:ledger.length+1,spell,
      title,pattern:clone(pattern),proposedMinute:minute,trials:[]};
    ledger.push(hypothesis);
    return hypothesis.id;
  }
  function begin(actor:number,id:number,object:number,minute:number,before:MagicMeasurement){
    if(!owns(actor,id)||active.has(actor))throw Error('Cannot begin research');
    active.set(actor,{hypothesisId:id,object,startMinute:minute,before:clone(before)});
  }
  function finish(actor:number,object:number,minute:number,after:MagicMeasurement){
    const task=active.get(actor);
    if(!task||task.object!==object)throw Error('No matching trial');
    const hypothesis=owns(actor,task.hypothesisId);
    if(!hypothesis||hypothesis.trials.length>=48)throw Error('Research trial limit');
    const trial:MagicTrial={object,startMinute:task.startMinute,observedMinute:minute,
      before:clone(task.before),after:clone(after)};
    hypothesis.trials.push(trial);active.delete(actor);
    return hypothesis.id;
  }
  function cancel(actor:number){active.delete(actor);}
  function snapshot(){
    return {research:[...research.entries()].filter(([,v])=>v.length>0)
      .map(([id,items])=>[id,clone(items)] as ResearchRecord),
      active:[...active.entries()].map(([id,item])=>[id,clone(item)] as ActiveResearchRecord)};
  }
  function restore(records:ResearchRecord[],tasks:ActiveResearchRecord[]){
    research.forEach(v=>v.splice(0));
    active.clear();
    for(const [actor,items] of records){
      if(!research.has(actor)||items.length>24||!Array.isArray(items)||
        items.some((h,i)=>h.id!==i+1||!validHypothesisTitle(h.title)||
          !Number.isSafeInteger(h.proposedMinute)||!Array.isArray(h.trials)||
          h.trials.length>48))throw Error('Invalid research history');
      research.set(actor,clone(items));
    }
    for(const [actor,task] of tasks){
      if(active.has(actor)||!owns(actor,task.hypothesisId)||
         !Number.isSafeInteger(task.startMinute))
        throw Error('Invalid active experiment');
      active.set(actor,clone(task));
    }
  }
  return {register,owns,history,pending,draft,begin,finish,cancel,snapshot,restore};
}
