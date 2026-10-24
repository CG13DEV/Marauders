/**
 * [GAME] Full study -> hypothesize -> test -> observe loop in one physical room.
 * No "reveal original graph" button; students only collect evidence.
 */
import {createFunctionalMagicSlice} from './functional-magic.ts';
import type {Simulation} from '../core/Simulation.ts';
import {vec,type MagicPattern} from '../core/magic-graph.ts';

export const held:MagicPattern={
  nodes:[{kind:'levitate',controller:'position_lock',
    trajectory:{kind:'hold',point:vec(0,2,0)}}]
};
export const forced:MagicPattern={
  nodes:[{kind:'levitate',controller:'force_feedback',
    trajectory:{kind:'hold',point:vec(0,2,0)}}]
};
export function createMagicResearchLab(world?:Simulation){
  const school=createFunctionalMagicSlice(world);
  return {...school,learnPrinciples(){
    for(let i=0;i<30;i++)school.world.step();
    if(school.world.knownMagicPrimitives(school.pupil).length!==3)
      throw Error('Academic theory was not really acquired');
  }};
}
