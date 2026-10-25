import {runControlledSpellComparison}
  from '../scenarios/controlled-spell-comparison.ts';
const report=runControlledSpellComparison();
console.log('[GAME] Контролируемая левитация: именованная формула и две гипотезы');
console.log(JSON.stringify(report,null,2));
console.log('Никакой оригинальный граф не раскрыт.');
