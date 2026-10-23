import {createMagicResearchLab,held,forced} from '../scenarios/magic-research-lab.ts';
import {vec} from '../core/magic-graph.ts';
import {compareMagicEvidence} from '../core/magic-research.ts';

const f=createMagicResearchLab();
f.learnPrinciples();
for(const [title,pattern] of [['Фиксация положения',held],
  ['Обратная связь',forced]] as const){
  f.world.execute({type:'propose_magic_hypothesis',actor:f.pupil,
    spell:'wingardium_leviosa',title,pattern});
}
for(let id=1;id<=2;id++){
  f.world.execute({type:'test_magic_hypothesis',actor:f.pupil,
    hypothesisId:id,object:f.feather});
  f.world.step();
  f.world.execute({type:'disturb_object',actor:f.pupil,
    object:f.feather,impulse:vec(1,0,0)});
  f.world.step();
  f.world.execute({type:'record_magic_trial',actor:f.pupil,
    hypothesisId:id,object:f.feather});
}
const notes=f.world.magicHypotheses(f.pupil);
console.log('Исследователь:',f.world.label(f.pupil));
console.log('Исследуем:', 'Wingardium Leviosa');
console.log('Записи:',JSON.stringify(notes,null,2));
console.log('Сравнение наблюдений:',
  compareMagicEvidence(notes[0]!.trials[0]!,notes[1]!.trials[0]!));
console.log('Оригинальная структура всё ещё НЕ установлена.');
