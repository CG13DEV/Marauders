/** Experiment #25: evidence becomes a personal goal for an ordinary student. */
import {createSimulation} from '../core/Simulation.ts';

const w=createSimulation();
const home=w.room('home','Гостиная');
const passage=w.room('passage','Переход');
const hall=w.room('hall','Галерея');
w.connect(home,passage);w.connect(passage,hall);
const student=w.character('student','Любознательная ученица',home);
const culprit=w.character('culprit','Нарушитель',hall);
const witness=w.character('witness','Очевидец',hall);
const vase=w.fragileObject('vase','Ваза',hall);
w.setGuarded(culprit,true);
w.setDailyLife(student,{homeRoom:hall,diningRoom:hall,
  style:'outgoing',interest:'castle',intentionPlanning:true,evidenceInquiry:true});
w.execute({type:'break_object',actor:culprit,target:vase});
w.execute({type:'move',actor:student,destination:passage});
w.execute({type:'move',actor:student,destination:hall});
for(let i=0;i<12;i++)w.step();
const goal=w.intentionHistory(student).find(x=>x.kind==='inquire');
console.log(JSON.stringify({
  observedDamage:w.observations(student).some(x=>
    x.kind==='inspected_object'&&x.target===vase&&x.broken),
  personallyWitnessedCulprit:w.observations(student).some(x=>
    x.kind==='witnessed_breakage'),
  autonomousGoal:goal,
  localQuestions:w.events().filter(x=>x.type==='question_asked'&&x.actor===student)
    .map(x=>x.type==='question_asked'
      ?{listener:w.label(x.listener),answered:x.answered}:null),
  attributedBeliefs:w.beliefs(student).map(x=>x.evidence),
  causedPunishment:w.events().some(x=>x.type==='house_points_changed')
},null,2));
