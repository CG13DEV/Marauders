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
import {createPlayerSpace,within,CUP_SPOT} from './player-space.js';

export const TIMED_PLAYER_ACTION_SECONDS=Object.freeze({talk:90,ask_cup:45,wait_gallery:60});

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
  const rooms=[graph.common,graph.landing,graph.gallery,...graph.research,...graph.legacy];
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
  const personalConversations=[];
  let pendingAction=null;
  let lastInteraction=null;
  const localActivities=createRoomActivities({
    plan:commonPlan(),actors:npcs,
    commonKey:graph.common.key,
    nowSeconds:world.worldSeconds(),
    initialLocations:observer.state()
  });
  const playerSpace=createPlayerSpace({
    graph,playerHome:boys.key,walkableCommon:localActivities.walkable
  });
  function playerView(){
    const room=world.currentRoom(playerId);
    const personal=world.observations(playerId);
    const inspected=personal.some(o=>o.kind==='inspected_object'&&o.target===artifactId);
    const knownExits=world.knownExits(playerId,room)
      .map(id=>roomKeyForId.get(id)).filter(Boolean);
    const space=playerSpace.view(knownExits);
    const sawCup=room===common&&within(space.position,CUP_SPOT,5.8);
    const journal=personal.flatMap(o=>{
      if(o.kind==='inspected_object'&&o.target===artifactId)
        return [o.broken?'Ты осмотрел разбитую чашку.':'Ты изучил старинную чашку.'];
      if(o.kind==='witnessed_breakage'&&o.target===artifactId)
        return ['Ты видел, как разбилась старинная чашка.'];
      if(o.kind==='heard_crash')return ['Ты слышал звук разбитого предмета.'];
      return [];
    });
    return {
      key:playerKey,name:playerDefinition.name,
      room:roomKeyForId.get(room)??null,
      ...space,
      journal:[
        ...(space.knownRooms.includes(graph.gallery.key)
          ?['Ты обнаружил проход к галерее четвёртого этажа.']:[]),
        ...space.surveyedWings.map(wing=>wing==='boys'
          ?'Ты изучил таблички на лестнице мальчиков.'
          :'Ты изучил таблички на лестнице девочек.'),
        ...journal,...personalConversations.map(x=>x.journal).filter(Boolean)
      ].slice(-8),
      interaction:pendingAction?{
        type:pendingAction.type,
        ...(pendingAction.listener?{listener:pendingAction.listener,
          speaker:names.get(pendingAction.listenerId)}:{}),
        durationSeconds:pendingAction.durationSeconds,
        remainingSeconds:Math.max(0,pendingAction.endsAt-world.worldSeconds())
      }:null,
      lastInteraction:lastInteraction?{...lastInteraction}:null,
      ...(sawCup?{cup:{broken:world.isBroken(artifactId),inspected}}:{})
    };
  }
  function nearbyPeople(){
    const playerRoom=world.currentRoom(playerId);
    if(playerRoom!==common)return [];
    const here=localActivities.snapshot();
    const origin=playerSpace.view([]).position;
    return here.flatMap(npc=>{
      const id=ids.get(npc.actor);
      if(id===undefined||world.currentRoom(id)!==playerRoom||
         world.timedTravelOf(id)!==null)return [];
      const range=Math.hypot(npc.x-origin.x,npc.z-origin.z);
      if(range>5.6)return [];
      return [{key:npc.actor,name:names.get(id),x:npc.x,z:npc.z,
        distance:Math.round(range*100)/100,canTalk:range<=2.25}];
    }).sort((a,b)=>a.distance-b.distance||a.key.localeCompare(b.key));
  }
  function npcContact(key){
    if(typeof key!=='string')return {ok:false,reason:'unknown_listener'};
    const npc=nearbyPeople().find(x=>x.key===key);
    if(!npc)return {ok:false,reason:'not_visible'};
    if(!npc.canTalk)return {ok:false,reason:'not_in_reach'};
    return {ok:true,npc,id:ids.get(key)};
  }
  function interruptInteraction(reason){
    if(!pendingAction)return;
    lastInteraction={type:pendingAction.type,status:'interrupted',
      reason,at:world.worldSeconds()};
    pendingAction=null;
  }
  function finishInteraction(){
    const action=pendingAction;
    if(!action)return;
    if(action.type==='wait_gallery'){
      if(!playerSpace.canUseGalleryBench()){
        interruptInteraction('not_in_reach');return;
      }
      personalConversations.push({
        journal:'Ты провёл минуту на каменной скамье галереи.'
      });
      lastInteraction={type:action.type,status:'completed',
        at:world.worldSeconds()};
      pendingAction=null;
      return;
    }
    // The world can change during a conversation. Never synthesize a
    // testimony after the listener has departed or started travelling.
    const contact=npcContact(action.listener);
    if(!contact.ok||contact.id!==action.listenerId){
      interruptInteraction('listener_departed');return;
    }
    const command=action.type==='talk'
      ?{type:'chat',actor:playerId,listener:action.listenerId,topic:action.topic}
      :{type:'ask_about',actor:playerId,listener:action.listenerId,
        object:artifactId};
    const interaction=world.execute(command);
    pendingAction=null;
    if(!interaction.ok){
      lastInteraction={type:action.type,status:'rejected',
        reason:interaction.reason,at:world.worldSeconds()};
      return;
    }
    const statement=interaction.events.find(e=>e.type==='testimony_delivered');
    const answer=interaction.events.find(e=>e.type==='question_asked');
    const reply=action.type==='talk'
      ?'Вы поговорили о '+({lessons:'занятиях',castle:'Хогвартсе',
        hobbies:'увлечениях'}[action.topic])+'.'
      :statement
        ?(statement.claim.culprit===playerId
            ?'Насколько мне известно, чашку разбил ты.'
            :statement.claim.culprit!==undefined
              ?'Насколько мне известно, чашку разбил '+(names.get(statement.claim.culprit)??'кто-то')+'.'
              :'Я знаю, что чашка была разбита.')
        :answer?.answered===false
          ?'Я не могу достоверно сказать, кто разбил чашку.'
          :'У меня нет сведений об этом.';
    const dialogue={speaker:contact.npc.name,listener:contact.npc.key,
      answer:reply,answered:action.type==='talk'||Boolean(statement),
      source:action.type==='talk'?'conversation':'question_asked'};
    if(action.type==='ask_cup'&&statement)
      personalConversations.push({journal:'Со слов '+contact.npc.name+': '+reply});
    lastInteraction={type:action.type,status:'completed',
      dialogue,at:world.worldSeconds()};
  }
  function submit(intent){
    // All commands are scoped to the controlled ECS identity. Busy player
    // actions occupy world seconds, not animation frames or a second clock.
    if(!intent||typeof intent!=='object'||Array.isArray(intent)||
       Object.hasOwn(intent,'actor')||Object.hasOwn(intent,'playerId')||
       Object.hasOwn(intent,'entityId'))
      return {ok:false,reason:'invalid_intent'};
    if(intent.type==='cancel_interaction'){
      if(!pendingAction)return {ok:false,reason:'no_active_interaction',
        player:playerView()};
      interruptInteraction('player_cancelled');
      return {ok:true,cancelled:true,player:playerView()};
    }
    if(pendingAction)
      return {ok:false,reason:'busy',player:playerView()};
    let result;
    if(intent.type==='walk'){
      const moved=playerSpace.walk(intent.dx,intent.dz);
      return {...moved,player:playerView()};
    }
    if(intent.type==='survey_wing'){
      const seen=playerSpace.survey(intent.wing);
      return {...seen,player:playerView()};
    }
    if(intent.type==='talk'||intent.type==='ask_cup'){
      const contact=npcContact(intent.listener);
      if(!contact.ok)return {ok:false,reason:contact.reason,player:playerView()};
      if(intent.type==='talk'){
        if(!['lessons','castle','hobbies'].includes(intent.topic))
          return {ok:false,reason:'wrong_topic'};
        const day=Math.floor(world.worldSeconds()/86400);
        const chatted=id=>world.conversationHistory(id)
          .some(m=>Math.floor(m.minute/1440)===day);
        if(chatted(playerId)||chatted(contact.id))
          return {ok:false,reason:'already_chatted',player:playerView()};
      }else{
        const observed=world.observations(playerId)
          .some(o=>o.target===artifactId&&
            (o.kind==='witnessed_breakage'||
             (o.kind==='inspected_object'&&o.broken)));
        if(!observed&&!world.beliefs(playerId).some(b=>b.claim.object===artifactId))
          return {ok:false,reason:'not_known',player:playerView()};
      }
      const durationSeconds=TIMED_PLAYER_ACTION_SECONDS[intent.type];
      pendingAction={type:intent.type,listener:intent.listener,
        listenerId:contact.id,
        ...(intent.type==='talk'?{topic:intent.topic}:{}),
        durationSeconds,endsAt:world.worldSeconds()+durationSeconds};
      lastInteraction=null;
      return {ok:true,started:true,player:playerView()};
    }
    if(intent.type==='wait_gallery'){
      if(!playerSpace.canUseGalleryBench())
        return {ok:false,reason:'not_in_reach',player:playerView()};
      const durationSeconds=TIMED_PLAYER_ACTION_SECONDS.wait_gallery;
      pendingAction={type:'wait_gallery',durationSeconds,
        endsAt:world.worldSeconds()+durationSeconds};
      lastInteraction=null;
      return {ok:true,started:true,player:playerView()};
    }
    if(intent.type==='survey_gallery'){
      const found=playerSpace.surveyGallery();
      return {...found,player:playerView()};
    }
    if(intent.type==='search_passages'){
      if(intent.room!==undefined)return {ok:false,reason:'invalid_intent'};
      result=world.execute({type:'search_passages',actor:playerId});
    }else if(intent.type==='move'){
      if(typeof intent.destination!=='string')
        return {ok:false,reason:'invalid_intent'};
      const destination=world.id(intent.destination);
      if(destination===undefined||!playerSpace.knows(intent.destination))
        return {ok:false,reason:'unknown_destination',player:playerView()};
      if(!playerSpace.canCross(intent.destination))
        return {ok:false,reason:'not_in_reach',player:playerView()};
      result=world.execute({type:'move',actor:playerId,
        destination});
      if(result.ok)playerSpace.enter(intent.destination);
    }else if(intent.type==='inspect_cup'||intent.type==='break_cup'){
      if(!playerSpace.canReachCup())
        return {ok:false,reason:'not_in_reach',player:playerView()};
      result=world.execute({type:intent.type==='inspect_cup'?
        'inspect_object':'break_object',actor:playerId,target:artifactId});
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
    const visibleRoom=roomKeyForId.get(world.currentRoom(playerId));
    return {
      tick:world.tick(),worldSeconds,clock,
      sequence,locations:observer.state()
        .filter(([,location])=>location===visibleRoom)
        .map(pair=>[...pair]),
      journeys:npcs.flatMap(character=>journeys.filter(j=>j.actor===character.key)
        .filter(j=>j.from===roomKeyForId.get(world.currentRoom(playerId))||
          j.to===roomKeyForId.get(world.currentRoom(playerId)))),
      activities:world.currentRoom(playerId)===common?localActivities.snapshot():[],
      recent:world.currentRoom(playerId)===common?[...recent]:[],
      player:playerView(),nearbyPeople:nearbyPeople()
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
      const until=Math.min(now+remaining,nextTick,arrival??Infinity,
        pendingAction?.endsAt??Infinity);
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
      localActivities.advanceTo(until,currentLocations,travellers,
        pendingAction?.listener?[pendingAction.listener]:[]);
      if(pendingAction){
        if(pendingAction.listener&&!npcContact(pendingAction.listener).ok)
          interruptInteraction('listener_departed');
        else if(until===pendingAction.endsAt)finishInteraction();
      }
    }
    const events=world.events();
    const fresh=events.slice(cursor);cursor=events.length;
    const positions=new Map(observer.state());
    // Player belongs to the same ECS room even though the NPC observer
    // correctly excludes the manually controlled avatar from its roster.
    positions.set(playerKey,roomKeyForId.get(world.currentRoom(playerId)));
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
    recent=world.currentRoom(playerId)===common
      ?[...activity,...recent].slice(0,6):[];
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
