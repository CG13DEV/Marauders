import {createFunctionalMagicSlice} from '../scenarios/functional-magic.ts';
import {vec} from '../core/magic-graph.ts';

const {world,pupil,spectator,feather}=createFunctionalMagicSlice();
for(let i=0;i<30;i++)world.step();
console.log('[GAME] Learned formula:',world.spellStage(pupil,'wingardium_leviosa'));
console.log('Learned components:',world.knownMagicPrimitives(pupil));
console.log('Absent pupil learned:',world.knownMagicPrimitives(spectator));
for(const controller of ['position_lock','force_feedback'] as const){
  console.log('Controller:',controller,world.execute({type:'cast_pattern',actor:pupil,
    object:feather,pattern:{nodes:[{kind:'levitate',controller,
      trajectory:{kind:'hold',point:vec(0,2,0)}}]}}).ok);
  for(let i=0;i<12;i++)world.step();
  world.execute({type:'disturb_object',actor:pupil,object:feather,impulse:vec(1,0,0)});
  world.step();
  console.log('After impulse:',world.magicState(feather));
}
