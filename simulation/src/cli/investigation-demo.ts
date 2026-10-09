/** Experiment #23: a cat's local alarm creates a caretaker search detour. */
import {createSimulation} from '../core/Simulation.ts';

const world=createSimulation();
const office=world.room('office','Кабинет Филча');
const vestibule=world.room('vestibule','Промежуточный коридор');
const hall=world.room('hall','Галерея с разбитой вазой');
world.connect(office,vestibule);
world.connect(vestibule,hall);
const filch=world.character('filch','Аргус Филч',office);
const norris=world.character('norris','Миссис Норрис',hall);
const culprit=world.character('pupil','Нарушитель',hall);
const vase=world.fragileObject('vase','Ваза',hall);
world.configurePatrol(filch,'caretaker',[office]);
world.configurePatrol(norris,'animal',[hall,office],filch,office);
world.execute({type:'break_object',actor:culprit,target:vase});
for(let i=0;i<12;i++)world.step();
const events=world.events();
console.log(JSON.stringify({
  alarms:events.filter(e=>e.type==='animal_alerted'),
  filchVisits:events.filter(e=>e.type==='entity_moved'&&e.actor===filch)
    .map(e=>e.type==='entity_moved'?world.label(e.to):''),
  foundDamage:events.some(e=>e.type==='object_inspected'&&e.actor===filch&&
    e.target===vase&&e.broken),
  inventedAccusations:world.beliefs(filch).length,
  resumedPatrol:world.patrolState(filch)?.search===undefined
},null,2));
