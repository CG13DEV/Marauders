/**
 * [GAME] An optional learner's scientific habit, not a hidden spell unlock.
 * Read ONLY personal notes, personally learned primitives, local observed
 * objects, and the public world clock. Authoritative rules live in execute().
 */
import type {Command} from './Simulation.ts';
import type {MagicHypothesis,PendingMagicTrial} from './magic-research.ts';
import type {MagicPrimitive,Vec3,MagicPattern} from './magic-graph.ts';
export type LocalMagicalObject={id:number;label:string;position:Vec3};

/** After-school laboratory access and normal evening leisure. No classes or
 * meals are preempted; the outer intention/need arbiter still has final say. */
export function isResearchTime(minute:number):boolean{
  const local=minute%1440;
  return (local>=17*60&&local<18*60)||
    (local>=19*60+10&&local<20*60+30);
}

/** A very small scientific policy: construct alternate explanations and
 * probe a real object. The formulas are hypotheses, NOT spell provenance. */
export function nextLocalMagicResearchAction(input:{
  actor:number;spell:'wingardium_leviosa';minute:number;
  known:readonly MagicPrimitive[];
  visible:readonly LocalMagicalObject[];
  hypotheses:readonly MagicHypothesis[];
  pending:PendingMagicTrial|null;
}):Command|null{
  const {actor,spell,minute,known,visible,hypotheses,pending}=input;
  // No global search for target IDs: object discovery happens by sight.
  const object=pending
    ?visible.find(x=>x.id===pending.object)
    :[...visible].sort((a,b)=>a.id-b.id)[0];
  if(!object)return null;
  if(pending){
    if(minute===pending.startMinute+10){
      return {type:'disturb_object',actor,object:object.id,
        impulse:{x:1,y:0,z:0}};
    }
    if(minute>=pending.startMinute+20)
      return {type:'record_magic_trial',actor,object:object.id,
        hypothesisId:pending.hypothesisId};
    return null;
  }
  // One hypothesis per personally learned controller. We don't claim either
  // hypothesis matches the original spell, only that both can be tested.
  for(const [controller,title] of [
    ['position_lock','Удержание положения'],
    ['force_feedback','Компенсация отклонения']
  ] as const){
    if(!known.includes(controller)||
       hypotheses.some(h=>h.pattern.nodes.some(node=>
         node.kind==='levitate'&&node.controller===controller)))continue;
    const pattern:MagicPattern={nodes:[{kind:'levitate',controller,
      trajectory:{kind:'hold',point:{
        x:object.position.x,y:object.position.y+2,z:object.position.z
      }}}]};
    return {type:'propose_magic_hypothesis',actor,spell,title,pattern};
  }
  const next=hypotheses.find(h=>h.spell===spell&&h.trials.length===0);
  return next?{type:'test_magic_hypothesis',actor,
    hypothesisId:next.id,object:object.id}:null;
}
