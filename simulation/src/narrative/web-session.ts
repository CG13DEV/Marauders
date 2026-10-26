/**
 * [GAME] G5.1 text-school inspector and action controller.
 * Every visible affordance is grounded in the player's own current world.
 * This presentation is a development tool, not a new gameplay authority.
 */
import {createTextSession, type createStarterSchool} from '../cli/text-game.ts';
import {NarrativeBridge} from './bridge.ts';
import {scenePerspective} from './perspective.ts';
import {MockNarrativeProvider,type NarrativeProvider} from './provider.ts';
import {spellDefinitions,type SpellId} from '../core/spellcraft.ts';
import {restoreSimulation,serializeCheckpoint} from '../core/persistence.ts';

export type UiAction =
  | {kind:'describe'}
  | {kind:'move';target:string}
  | {kind:'wait';ticks:number}
  | {kind:'speak';target:string;text:string}
  | {kind:'chat';target:string;topic:'lessons'|'castle'|'hobbies'}
  | {kind:'ask';target:string}
  | {kind:'offer';target:string;purpose:'study'|'explore'}
  | {kind:'cast'}
  | {kind:'practice';guide?:string}
  | {kind:'study';book:string};

export type UiState = ReturnType<ReturnType<typeof createNarrativeWebSession>['state']>;

const rooms=['common_room','corridor','classroom','library'] as const;
const people=['james','lily','remus','peter','professor'] as const;
const keys=[...rooms,...people];
const knownKey=(world:ReturnType<typeof createStarterSchool>,id:number):string|null=>
  keys.find(key=>world.id(key)===id)??null;

/** Author-authored room atmosphere: not simulated new objects or discoveries. */
const atmosphere:Record<string,string>={
  common_room:'Уютная общая гостиная. Отсюда начинается твой школьный день.',
  corridor:'Коридор соединяет жилую часть замка, класс чар и библиотеку.',
  classroom:'Класс чар. Здесь проходят уроки, если преподаватель и ученики присутствуют.',
  library:'Библиотека. Книги здесь являются реальными объектами симуляции.'
};

export function createNarrativeWebSession(options:{
  provider?:NarrativeProvider; mode?:'mock'|'openai';
  session?:ReturnType<typeof createTextSession>;
}={}){
  const session=options.session??createTextSession();
  const provider=options.provider??new MockNarrativeProvider();
  const bridge=new NarrativeBridge(provider,{
    'Лили Эванс':'[GAME] Любознательная, принципиальная, доброжелательная, не склонна льстить.',
    'Ремус Люпин':'[GAME] Вдумчивый, сдержанный, внимательный.',
    'Питер Петтигрю':'[GAME] Осторожный, общительный, хочет быть принятым.',
    'Преподаватель чар':'[GAME] Спокойный преподаватель, требовательный к пониманию материала.'
  });
  const mode=options.mode??'mock';
  const world=()=>session.world();
  const player=()=>world().id('james')!;

  function state(){
    const w=world();
    const actor=player();
    const view=scenePerspective(w,actor);
    const location=w.currentRoom(actor);
    if(location===null)throw Error('Player is not in a room');
    const senses=w.sensesOf(actor);
    const visible=senses?.vision??false;
    const exits=w.knownExits(actor,location).map(id=>({
      key:knownKey(w,id),label:w.label(id)
    })).filter((entry):entry is {key:string;label:string}=>entry.key!==null);
    const nearby=visible?w.occupants(location).filter(id=>id!==actor).map(id=>({
      key:knownKey(w,id),label:w.label(id),canTalk:(senses?.hearing===true&&w.sensesOf(id)?.hearing===true)
    })).filter((entry):entry is {key:string;label:string;canTalk:boolean}=>entry.key!==null):[];
    const books=w.visibleBooks(actor).map(book=>({
      key:'book:'+String(book.id),label:book.label
    }));
    const skills=(Object.keys(spellDefinitions) as SpellId[]).map(spell=>({
      key:spell,incantation:spellDefinitions[spell].incantation,
      stage:w.spellStage(actor,spell)
    }));
    const lessons=w.attendance(actor).map(l=>({
      subject:l.subject,status:l.status,
      startsAt:l.startsAt,endsAt:l.endsAt,
      room:w.label(l.room)
    }));
    return {
      mode,player:w.label(actor),
      time:w.clock().label,day:w.clock().day,
      room:{key:knownKey(w,location),label:w.label(location),
        atmosphere:atmosphere[knownKey(w,location)??'']??'Новое место в Хогвартсе.'},
      view,
      exits,people:nearby,books,skills,lessons,
      lit:w.isIlluminated(actor),
      knowledgeGaps:w.knowledgeGaps(actor),
      social:{
        conversations:w.conversationHistory(actor).slice(-5).map(entry=>({
          with:w.label(entry.partner),topic:entry.topic,minute:entry.minute
        })),
        commitments:w.promiseHistory(actor).slice(-6).map(entry=>({
          with:w.label(entry.partner),kind:entry.kind,
          purpose:entry.purpose,minute:entry.minute
        }))
      },
      capabilities:{
        move:exits.length>0,wait:true,describe:true,
        speak:nearby.some(p=>p.canTalk),study:books.length>0,
        castLumos:skills.find(s=>s.key==='lumos')?.stage!=='unaware'
      },
      help:[
        'Кликни по выходу, чтобы переместиться. Мир продвинется на 10 игровых минут.',
        'Разговор «Сказать» — пока только текст: время, знания и отношения не изменяются.',
        '«Беседа о занятиях» и «Попросить о помощи» — настоящие игровые действия.',
        'Чтение книги занимает игровое время; для завершения опыта используй ожидание.',
        '«Описать сцену» вызывает рассказчика: MOCK бесплатно, OPENAI через отдельный API.'
      ]
    };
  }

  async function dispatch(action:UiAction):Promise<string>{
    const w=world(),actor=player();
    if(action.kind==='describe')return bridge.scene(w,actor);
    if(action.kind==='wait'){
      if(!Number.isSafeInteger(action.ticks)||action.ticks<1||action.ticks>12)
        throw Error('Можно ждать от 1 до 12 тиков за раз');
      bridge.clear();
      return session.respond('wait '+String(action.ticks));
    }
    if(action.kind==='cast')return session.respond('cast lumos');
    if(action.kind==='practice'){
      if(action.guide!==undefined&&!people.includes(action.guide as typeof people[number]))
        throw Error('Неизвестный наставник');
      return session.respond('practice lumos'+(action.guide?' '+action.guide:''));
    }
    if(action.kind==='move'){
      if(!rooms.includes(action.target as typeof rooms[number]))throw Error('Неизвестная комната');
      const current=w.currentRoom(actor);
      if(current===null||!w.knownExits(actor,current).some(id=>w.id(action.target)===id))
        throw Error('Этот переход тебе неизвестен');
      const result=session.respond('go '+action.target);
      if(result.includes('Не получилось'))return result;
      bridge.clear();
      return result;
    }
    if(action.kind==='study'){
      const match=/^book:(\d+)$/.exec(action.book);
      if(!match)throw Error('Неизвестная книга');
      const id=Number(match[1]);
      if(!w.visibleBooks(actor).some(b=>b.id===id))
        throw Error('Книга сейчас недоступна');
      const result=w.execute({type:'study_book',actor,book:id});
      if(!result.ok)return 'Чтение не началось: '+result.reason;
      return 'Ты начал читать '+w.label(id)+'. Для завершения нужно 20 игровых минут рядом с книгой.';
    }
    const target='target' in action?action.target:'';
    if(!people.includes(target as typeof people[number]))throw Error('Неизвестный персонаж');
    const other=w.id(target);
    if(other===undefined||other===actor||w.currentRoom(other)!==w.currentRoom(actor))
      throw Error('Собеседник сейчас не рядом');
    if(action.kind==='speak'){
      if(typeof action.text!=='string'||action.text.trim().length<1||action.text.length>700)
        throw Error('Напиши реплику длиной от 1 до 700 символов');
      return bridge.talk(w,actor,other,action.text);
    }
    if(action.kind==='chat'){
      if(!['lessons','castle','hobbies'].includes(action.topic))
        throw Error('Неизвестная тема');
      return session.respond('chat '+target+' '+action.topic);
    }
    if(action.kind==='ask')return session.respond('ask '+target+' lumos');
    if(action.kind==='offer'){
      if(!['study','explore'].includes(action.purpose))throw Error('Неизвестный тип встречи');
      return session.respond('offer '+target+' '+action.purpose);
    }
    throw Error('Неизвестное действие');
  }

  function save():string {return serializeCheckpoint(world());}
  function load(saved:string):void{
    session.replaceWorld(restoreSimulation(saved));
    bridge.clear();
  }
  return {state,dispatch,save,load};
}
