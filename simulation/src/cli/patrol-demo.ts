/** Experiment #22: a cat cannot talk or teleport, and pupils need a real toilet. */
import {createSimulation} from '../core/Simulation.ts';
const world=createSimulation();
const hall=world.room('hall','Школьный коридор',{floor:0,kind:'gallery'});
const office=world.room('office','Кабинет Филча',{floor:0,kind:'office'});
const toilet=world.room('bathroom','Туалет',{floor:0,kind:'bathroom'});
world.connect(hall,office);world.connect(hall,toilet);
const filch=world.character('filch','Аргус Филч',office);
const norris=world.character('norris','Миссис Норрис',hall);
const pupil=world.character('pupil','Первокурсник',hall);
world.configurePatrol(filch,'caretaker',[office,hall]);
world.configurePatrol(norris,'animal',[hall,office],filch,office);
world.configureToilet(pupil,[toilet],90);
const vase=world.fragileObject('vase','Ваза',hall);
world.execute({type:'break_object',actor:pupil,target:vase});
for(let i=0;i<12;i++)world.step();
console.log(JSON.stringify({
  toiletVisits:world.toiletState(pupil)?.visits,
  toiletRecords:world.events().filter(e=>e.type==='toilet_used').length,
  catSignals:world.events().filter(e=>e.type==='animal_alerted').length,
  filchObserved:world.observations(filch),
  filchPatrol:world.patrolState(filch),
  catPatrol:world.patrolState(norris),
  pupilEndingRoom:world.label(world.currentRoom(pupil)!),
  housePoints:world.housePoints()
},null,2));
