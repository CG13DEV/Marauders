/**
 * RB-4 [GAME] A small, real, browser-executed ECS school-life slice.
 * World.step() makes every NPC choice. This adapter publishes only room
 * occupancy and locally observable events, never NPC beliefs or runtime stores.
 * Four experimental year-seven pupils != a 634-person rendered school.
 */
import {createSimulation} from '../../simulation/src/core/Simulation.ts';
import {PassiveRoomObserver,roomSnapshot,roomDelta}
  from '../../simulation/src/core/passive-observer.ts';

export const LIVING_ACTORS=Object.freeze([
  {key:'lily',name:'Лили',variant:'ginger',wing:'girls',interest:'lessons'},
  {key:'james',name:'Джеймс',variant:'dark',wing:'boys',interest:'castle'},
  {key:'sirius',name:'Сириус',variant:'player',wing:'boys',interest:'castle'},
  {key:'remus',name:'Ремус',variant:'blond',wing:'boys',interest:'lessons'}
]);

function visibleEvent(world,event,commonId,names){
  const actor=names.get(event.actor);
  if(!actor)return null;
  if(event.type==='conversation_shared' ||
     event.type==='meeting_offered' ||
     event.type==='meeting_answered'){
    if(world.currentRoom(event.actor)!==commonId ||
       world.currentRoom(event.listener)!==commonId)return null;
    const listener=names.get(event.listener);
    if(!listener)return null;
    if(event.type==='conversation_shared')
      return actor+' разговаривает с '+listener;
    if(event.type==='meeting_offered')
      return actor+' приглашает '+listener+' на встречу';
    return actor+(event.accepted?' принимает':' отклоняет')+' приглашение';
  }
  if(event.type==='meeting_resolved' && event.room===commonId){
    const listener=names.get(event.listener);
    if(!listener)return null;
    return event.outcome==='kept'
      ?actor+' и '+listener+' встретились'
      :'Встреча '+actor+' и '+listener+' не состоялась';
  }
  return null;
}

export function createLivingRoom(graph,{warmupTicks=67}={}){
  if(!Number.isSafeInteger(warmupTicks)||warmupTicks<0)throw Error('Invalid warmup');
  const world=createSimulation();
  const rooms=[graph.common,graph.landing,...graph.research,...graph.legacy];
  const roomKeys=rooms.map(room=>room.key);
  for(const room of rooms)world.room(room.key,room.key);
  for(const [a,b] of graph.links){
    const from=world.id(a),to=world.id(b);
    if(from===undefined||to===undefined)throw Error('Unknown living-room passage');
    world.connect(from,to);
  }
  const common=world.id(graph.common.key),landing=world.id(graph.landing.key);
  const boys=graph.research.find(room=>room.year===7&&room.wing==='boys');
  const girls=graph.research.find(room=>room.year===7&&room.wing==='girls');
  if(common===undefined||landing===undefined||!boys||!girls)
    throw Error('Missing required Gryffindor graph nodes');
  const names=new Map();
  const ids=new Map();
  for(const [index,character] of LIVING_ACTORS.entries()){
    const bedroom=world.id(character.wing==='girls'?girls.key:boys.key);
    const actor=world.character(character.key,character.name,common);
    ids.set(character.key,actor);
    names.set(actor,character.name);
    world.setDailyLife(actor,{
      homeRoom:bedroom,diningRoom:landing,socialRoom:common,
      leisureRoom:common,style:index===3?'reserved':'outgoing',
      interest:character.interest,
      socialChoice:'reflective',socialInvitations:true,
      relationshipLearning:true,repairInitiative:true,repairResponse:'open'
    });
  }
  // Initial author-defined familiarity is an experimental setup, not CANON.
  world.setTrust(ids.get('james'),ids.get('sirius'),'trusted');
  world.setTrust(ids.get('sirius'),ids.get('james'),'trusted');
  for(let i=0;i<warmupTicks;i++)world.step();
  const actorKeys=LIVING_ACTORS.map(x=>x.key);
  const observer=new PassiveRoomObserver(roomSnapshot(world,actorKeys,roomKeys));
  let sequence=0;
  let cursor=world.events().length;
  let recent=[];
  function snapshot(){
    return {
      tick:world.tick(),clock:world.clock().label,
      sequence,locations:observer.state().map(pair=>[...pair]),
      recent:[...recent]
    };
  }
  function advance(){
    world.step();
    const events=world.events();
    const fresh=events.slice(cursor);cursor=events.length;
    const delta=roomDelta(world,fresh,actorKeys,roomKeys,++sequence);
    observer.apply(delta);
    // Only what a visitor to the common room could physically encounter.
    const activity=fresh.map(event=>visibleEvent(world,event,common,names))
      .filter(Boolean);
    recent=[...activity,...recent].slice(0,6);
    // Catch any adapter desynchronization, never silently render a false world.
    const authoritative=roomSnapshot(world,actorKeys,roomKeys,sequence).locations
      .slice().sort(([a],[b])=>a.localeCompare(b));
    if(JSON.stringify(observer.state())!==JSON.stringify(authoritative))
      throw Error('RB-4 observer diverged from ECS world');
    return {delta,activity,snapshot:snapshot()};
  }
  return Object.freeze({snapshot,advance});
}
