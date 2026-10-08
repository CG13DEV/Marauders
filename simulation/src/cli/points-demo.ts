/** Experiment #21: a false witness can cause a real disciplinary mistake. */
import {createSimulation} from '../core/Simulation.ts';
const world=createSimulation();
const hall=world.room('hall','Холл');
const office=world.room('office','Кабинет декана');
world.connect(hall,office);
const james=world.character('james','Джеймс Поттер',hall);
const remus=world.character('remus','Ремус Люпин',hall);
const snape=world.character('snape','Северус Снейп',office);
const lily=world.character('lily','Лили Эванс',office);
const mcgonagall=world.character('mcgonagall','Минерва Макгонагалл',office);
world.registerHouse(james,'gryffindor');
world.registerHouse(remus,'gryffindor');
world.registerHouse(lily,'gryffindor');
world.registerHouse(snape,'slytherin');
world.grantPointAuthority(mcgonagall,'teacher');
const vase=world.fragileObject('vase','Старая ваза',hall);
world.execute({type:'break_object',actor:remus,target:vase});
const claim={kind:'broke_object' as const,culprit:james,object:vase};
world.execute({type:'move',actor:remus,destination:office});
world.execute({type:'tell',actor:remus,listener:mcgonagall,claim});
const penalty=world.execute({type:'decide_house_points',actor:mcgonagall,pupil:james,
  delta:-20,reason:'По сообщению ученика разбил вазу',
  basis:{kind:'breakage_claim',object:vase}});
if(!penalty.ok)throw Error('Penalty failed: '+penalty.reason);
world.execute({type:'chat',actor:lily,listener:snape,topic:'castle'});
console.log(JSON.stringify({
  score:world.housePoints(),
  factualCulprit:world.label(remus),
  accused:world.label(world.pointHistory()[0]!.pupil),
  evidence:world.pointHistory()[0]!.evidence,
  lilyNews:world.knownPointNews(lily),lilyReaction:world.pointReactions(lily),
  snapeNews:world.knownPointNews(snape),events:world.events().length
},null,2));
