/** Experiment #24: damage is evidence, witness testimony is not world truth. */
import {createSimulation} from '../core/Simulation.ts';

const world=createSimulation();
const office=world.room('office','Кабинет Филча');
const passage=world.room('passage','Переход');
const hall=world.room('hall','Коридор с вазой');
world.connect(office,passage);
world.connect(passage,hall);
const filch=world.character('filch','Филч',office);
const norris=world.character('norris','Миссис Норрис',hall);
const culprit=world.character('culprit','Нарушитель',hall);
const witness=world.character('witness','Очевидец',hall);
const teacher=world.character('teacher','Профессор',office);
const vase=world.fragileObject('vase','Ваза',hall);
world.setGuarded(culprit,true);
world.registerHouse(culprit,'gryffindor');
world.grantPointAuthority(teacher,'teacher');
world.configurePatrol(filch,'caretaker',[office]);
world.configurePatrol(norris,'animal',[hall,office],filch,office);
world.execute({type:'break_object',actor:culprit,target:vase});
for(let i=0;i<24;i++)world.step();
const questioning=world.events().filter(e=>e.type==='question_asked'&&e.actor===filch);
console.log(JSON.stringify({
  catAlerts:world.events().filter(e=>e.type==='animal_alerted').length,
  filchQuestioned:questioning.map(e=>e.type==='question_asked'
    ?{person:world.label(e.listener),answered:e.answered}:null),
  filchBeliefs:world.beliefs(filch).map(b=>({
    claim:b.claim,source:b.evidence
  })),
  professorBeliefs:world.beliefs(teacher).map(b=>({
    claim:b.claim,source:b.evidence
  })),
  automaticHousePoints:world.housePoints().gryffindor
},null,2));
