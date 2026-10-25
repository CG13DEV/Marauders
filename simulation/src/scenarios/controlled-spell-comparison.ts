/**
 * [GAME] One reproducible black-box experiment with three independent
 * feathers. The scientist observes position/brightness only, never
 * requests the original formula's private MagicPattern or hidden mass.
 */
import {createSimulation} from '../core/Simulation.ts';
import {vec,type MagicPattern} from '../core/magic-graph.ts';
import {compareMagicEvidence,type MagicMeasurement,type MagicTrial}
  from '../core/magic-research.ts';

type Sample={kind:'formula'|'position_lock'|'force_feedback';
  trial:MagicTrial};
function visible(world:ReturnType<typeof createSimulation>,actor:number,object:number):
  MagicMeasurement{
  const observed=world.visibleMagicObjects(actor).find(o=>o.id===object);
  if(!observed)throw Error('No locally observable feather');
  return {position:{...observed.position},light:observed.light};
}
export function runControlledSpellComparison(){
  const world=createSimulation();
  const lab=world.room('controlled_lab','Контролируемая лаборатория');
  const scientist=world.character('scientist','Исследователь',lab);
  world.seedSpellKnowledge(scientist,'wingardium_leviosa','independent');
  world.seedMagicPrimitive(scientist,'position_lock');
  world.seedMagicPrimitive(scientist,'force_feedback');
  // Identical setup and impulses. Neither mass nor graph is leaked through
  // the observational API, even though the simulation enforces them.
  const specimens=[
    {kind:'formula' as const,key:'original'},
    {kind:'position_lock' as const,key:'candidate_lock'},
    {kind:'force_feedback' as const,key:'candidate_feedback'}
  ].map(s=>({...s,object:world.magicObject(s.key,'Перо '+s.key,lab,1,vec(0,0,0))}));
  const before=specimens.map(s=>visible(world,scientist,s.object));
  for(const s of specimens){
    const result=s.kind==='formula'
      ?world.execute({type:'cast_spell',actor:scientist,object:s.object,
        spell:'wingardium_leviosa',intent:'levitate',target:'object',
        incantation:'Wingardium Leviosa'})
      :world.execute({type:'cast_pattern',actor:scientist,object:s.object,
        pattern:{nodes:[{kind:'levitate',controller:s.kind,
          trajectory:{kind:'hold',point:vec(0,2,0)}}]} as MagicPattern});
    if(!result.ok)throw Error('Controlled casting rejected: '+result.reason);
  }
  world.step();
  for(const s of specimens){
    const disturbed=world.execute({type:'disturb_object',
      actor:scientist,object:s.object,impulse:vec(1,0,0)});
    if(!disturbed.ok)throw Error('Disturbance rejected');
  }
  world.step();
  const observations:Sample[]=specimens.map((s,i)=>({
    kind:s.kind,trial:{object:s.object,startMinute:480,observedMinute:500,
      before:before[i]!,after:visible(world,scientist,s.object)}
  }));
  return {observations,
    comparisons:{
      lock:compareMagicEvidence(observations[0]!.trial,observations[1]!.trial),
      feedback:compareMagicEvidence(observations[0]!.trial,observations[2]!.trial)
    },
    events:world.events().filter(e=>e.type==='magic_pattern_cast'||
      e.type==='magic_object_disturbed').map(e=>({type:e.type,minute:e.minute})),
    // Explicitly NO original-pattern property or truth score in public output.
    clockMinute:world.clock().absoluteMinute
  };
}
