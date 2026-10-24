/**
 * [GAME] An optional learner's scientific habit, not a hidden spell unlock.
 * Read ONLY personal notes, personally learned primitives, local observed
 * objects, and the public world clock. Authoritative rules live in execute().
 */
import type {Command} from './Simulation.ts';
import type {MagicHypothesis,PendingMagicTrial} from './magic-research.ts';
import type {MagicPrimitive,Vec3,MagicPattern} from './magic-graph.ts';
export type LocalMagicalObject={id:number;label:string;position:Vec3;busy?:boolean};

/** After-school laboratory access and normal evening leisure. No classes or
 * meals are preempted; the outer intention/need arbiter still has final say. */
export function isResearchTime(minute:number):boolean{
  const local=minute%1440;
  return (local>=17*60&&local<18*60)||
    (local>=19*60+10&&local<20*60+30)||
    (Math.floor(minute/1440)%7>=5&&local>=9*60&&local<11*60);
}

/** A very small scientific policy: construct alternate explanations and
 * probe a real object. The formulas are hypotheses, NOT spell provenance. */
export function nextLocalMagicResearchAction(input:{
  actor:number;spell:'wingardium_leviosa';minute:number;
  known:readonly MagicPrimitive[];
  visible:readonly LocalMagicalObject[];
  hypotheses:readonly MagicHypothesis[];
  pending:PendingMagicTrial|null;
  preferredController?:'position_lock'|'force_feedback';
}):Command|null{
  const {actor,spell,minute,known,visible,hypotheses,pending}=input;
  // A busy feather is visibly being experimented on: no hidden experiment
  // owner or global object catalog. Deterministic rotation spreads pupils
  // across whatever physical props they actually see.
  const free=[...visible].filter(o=>!o.busy).sort((a,b)=>a.id-b.id);
  const object=pending
    ?visible.find(x=>x.id===pending.object)
    :free.length?free[actor%free.length]:undefined;
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
  const choices=[
    ['position_lock','Удержание положения'],
    ['force_feedback','Компенсация отклонения']
  ] as const;
  const preferred=input.preferredController;
  const ordered=preferred
    ?[...choices].sort((a,b)=>Number(b[0]===preferred)-Number(a[0]===preferred))
    :choices;
  for(const [controller,title] of ordered){
    if(!known.includes(controller)||
       hypotheses.some(h=>h.pattern.nodes.some(node=>
         node.kind==='levitate'&&node.controller===controller)))continue;
    // Keep the original experimental target constant across hypotheses.
    // Recover it from the pupil's own notes, not the secret spell AST.
    const prior=hypotheses.flatMap(h=>h.pattern.nodes).find(n=>
      n.kind==='levitate'&&n.trajectory.kind==='hold');
    const target=prior?.kind==='levitate'&&prior.trajectory.kind==='hold'
      ?prior.trajectory.point
      :{x:object.position.x,y:object.position.y+2,z:object.position.z};
    const pattern:MagicPattern={nodes:[{kind:'levitate',controller,
      trajectory:{kind:'hold',point:{...target}}}]};
    return {type:'propose_magic_hypothesis',actor,spell,title,pattern};
  }
  const next=hypotheses.find(h=>h.spell===spell&&h.trials.length===0);
  // Don't start a 20-minute observation if curfew / room hours close
  // before the earliest legal measurement.
  return next&&isResearchTime(minute+10)&&isResearchTime(minute+20)
    ?{type:'test_magic_hypothesis',actor,
      hypothesisId:next.id,object:object.id}:null;
}
