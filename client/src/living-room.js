/**
 * RB-4 [GAME] A small, real, browser-executed ECS school-life slice.
 * World.step() makes every NPC choice. This adapter publishes only room
 * occupancy and locally observable events, never NPC beliefs or runtime stores.
 * Four experimental year-seven pupils != a 634-person rendered school.
 */
import {createSimulation} from '../../simulation/src/core/Simulation.ts';
import {PassiveRoomObserver,roomSnapshot,roomDelta}
  from '../../simulation/src/core/passive-observer.ts';
import {createRoomActivities} from '../../simulation/src/core/room-activities.js';
import {commonPlan} from './layout-common.js';

export const PLAYER_CAST=Object.freeze([
  {key:'james',name:'Джеймс',variant:'dark'},
  {key:'sirius',name:'Сириус',variant:'player'},
  {key:'remus',name:'Ремус',variant:'blond'},
  {key:'peter',name:'Питер',variant:'player'}
]);
export const LIVING_ACTORS=Object.freeze([
  {key:'lily',name:'Лили',variant:'ginger',wing:'girls',interest:'lessons'},
  {key:'james',name:'Джеймс',variant:'dark',wing:'boys',interest:'castle'},
  {key:'sirius',name:'Сириус',variant:'player',wing:'boys',interest:'castle'},
  {key:'remus',name:'Ремус',variant:'blond',wing:'boys',interest:'lessons'}
]);

function visibleEvent(event,commonKey,commonId,names,keyByActor,positions){
  // Locality is reconstructed in event order, not guessed from the final
  // ECS positions after a large time jump or a slow browser poll.
  const actor=names.get(event.actor);
  if(!actor)return null;
  if(event.type==='conversation_shared' ||
     event.type==='meeting_offered' ||
     event.type==='meeting_answered'){
    if(positions.get(keyByActor.get(event.actor))!==commonKey ||
       positions.get(keyByActor.get(event.listener))!==commonKey)return null;
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

export function createLivingRoom(graph,{warmupTicks=67,playerKey='peter'}={}){
  const playerDefinition=PLAYER_CAST.find(character=>character.key===playerKey);
  if(!playerDefinition)throw Error('Choose a playable Marauder');
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
  // G1: the player is an ordinary real ECS Character, not a second
  // Three.js-only pawn. Existing Marauders keep their warmup history.
  let playerId=ids.get(playerKey);
  if(playerId===undefined){
    playerId=world.character(playerKey,playerDefinition.name,common);
    ids.set(playerKey,playerId);
    names.set(playerId,playerDefinition.name);
  }
  world.setManualControl(playerId,true);
  const artifactId=world.fragileObject('common-room-cup','Старинная чашка',common);
  const npcs=LIVING_ACTORS.filter(actor=>actor.key!==playerKey);
  // RB-5.2: decisions remain the normal NPC scheduler's responsibility;
  // only accepted passage movements use the shared authoritative timeline.
  for(const npc of npcs)world.setAutonomousTimedTravel(ids.get(npc.key),true);
  const timedBridge=world.createTimedMovement();
  const roomKeyForId=new Map(roomKeys.map(key=>[world.id(key),key]));
  const keyByActor=new Map([...ids.entries()].map(([key,id])=>[id,key]));
  const actorKeys=npcs.map(x=>x.key);
  const observer=new PassiveRoomObserver(roomSnapshot(world,actorKeys,roomKeys));
  let sequence=0;
  let cursor=world.events().length;
  let recent=[];
  const localActivities=createRoomActivities({
    plan:commonPlan(),actors:npcs,
    commonKey:graph.common.key,
    nowSeconds:world.worldSeconds(),
    initialLocations:observer.state()
  });
  function playerView(){
    const room=world.currentRoom(playerId);
    const personal=world.observations(playerId);
    const inspected=personal.some(o=>o.kind==='inspected_object'&&o.target===artifactId);
    return {
      key:playerKey,name:playerDefinition.name,
      room:roomKeyForId.get(room)??null,
      knownExits:world.knownExits(playerId,room)
        .map(id=>roomKeyForId.get(id)).filter(Boolean),
      ...(room===common?{cup:{broken:world.isBroken(artifactId),
        inspected}}:{})
    };
  }
  function submit(intent){
    // This is the only browser-facing action boundary. Actor IDs cannot be
    // supplied by the renderer: all commands have the controlled character.
    if(!intent||typeof intent!=='object'||Array.isArray(intent)||
       Object.hasOwn(intent,'actor')||Object.hasOwn(intent,'playerId')||
       Object.hasOwn(intent,'entityId'))
      return {ok:false,reason:'invalid_intent'};
    let result;
    if(intent.type==='move'){
      const destination=typeof intent.destination==='string'?
        world.id(intent.destination):undefined;
      result=world.execute({type:'move',actor:playerId,
        destination:destination??-1});
    }else if(intent.type==='inspect_cup'){
      result=world.execute({type:'inspect_object',actor:playerId,
        target:artifactId});
    }else if(intent.type==='break_cup'){
      result=world.execute({type:'break_object',actor:playerId,
        target:artifactId});
    }else return {ok:false,reason:'invalid_intent'};
    return {
      ok:result.ok,
      ...(result.ok?{}:{reason:result.reason}),
      player:playerView()
    };
  }
  function snapshot(){
    const worldSeconds=world.worldSeconds();
    // ECS starts at 00:00; never add a second visual-only UTC offset.
    const totalMinutes=Math.floor(worldSeconds/60);
    const minute=totalMinutes%1440;
    const clock=String(Math.floor(minute/60)).padStart(2,'0')+':'+
      String(minute%60).padStart(2,'0');
    const journeys=npcs.flatMap(character=>{
      const leg=world.timedTravelOf(ids.get(character.key));
      if(!leg)return [];
      return [{
        actor:character.key,
        from:roomKeyForId.get(leg.from),to:roomKeyForId.get(leg.to),
        progress:leg.progress,paused:leg.paused,remainingSeconds:leg.remainingSeconds
      }];
    });
    return {
      tick:world.tick(),worldSeconds,clock,
      sequence,locations:observer.state().map(pair=>[...pair]),
      journeys,activities:localActivities.snapshot(),recent:[...recent],
      player:playerView()
    };
  }
  function advanceSeconds(seconds){
    if(!Number.isSafeInteger(seconds)||seconds<0||seconds>3600)
      throw Error('Invalid living-room advance duration');
    if(seconds===0)return {
      delta:{version:1,sequence,tick:world.tick(),movements:[]},
      activity:[],snapshot:snapshot()
    };
    let remaining=seconds;
    while(remaining>0){
      const now=world.worldSeconds();
      const nextTick=(world.tick()+1)*600;
      if(now>=nextTick)throw Error('Living clock missed school boundary');
      const arrival=timedBridge.nextArrival();
      const until=Math.min(now+remaining,nextTick,arrival??Infinity);
      if(until<=now)throw Error('Stalled living world time segment');
      timedBridge.advance(until);
      remaining-=until-now;
      if(world.worldSeconds()===nextTick)world.step();
      // Spatial decisions are part of the simulated world, not frame updates.
      // Every pass ends at an authoritative decision/arrival boundary.
      const currentLocations=roomSnapshot(world,actorKeys,roomKeys).locations;
      const travellers=npcs.flatMap(person=>{
        const leg=world.timedTravelOf(ids.get(person.key));
        return leg?[{actor:person.key}]:[];
      });
      localActivities.advanceTo(until,currentLocations,travellers);
    }
    const events=world.events();
    const fresh=events.slice(cursor);cursor=events.length;
    const positions=new Map(observer.state());
    const activity=[];
    for(const event of fresh){
      if(event.type==='entity_moved'){
        const key=keyByActor.get(event.actor);
        if(key)positions.set(key,roomKeyForId.get(event.to));
        continue;
      }
      const line=visibleEvent(event,graph.common.key,common,
        names,keyByActor,positions);
      if(line)activity.push(line);
    }
    const delta=roomDelta(world,fresh,actorKeys,roomKeys,++sequence);
    observer.apply(delta);
    recent=[...activity,...recent].slice(0,6);
    // Catch any adapter desynchronization, never silently render a false world.
    const authoritative=roomSnapshot(world,actorKeys,roomKeys,sequence).locations
      .slice().sort(([a],[b])=>a.localeCompare(b));
    if(JSON.stringify(observer.state())!==JSON.stringify(authoritative))
      throw Error('RB-5 observer diverged from ECS world');
    return {delta,activity,snapshot:snapshot()};
  }
  function advance(){
    // Retain the old one-tick diagnostic API. Presentation uses seconds.
    return advanceSeconds((world.tick()+1)*600-world.worldSeconds());
  }
  return Object.freeze({snapshot,advance,advanceSeconds,submit});
}
