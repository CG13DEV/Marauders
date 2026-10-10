/**
 * Text-first gameplay adapter. No rules live here; all mutations are validated
 * by the same ECS simulation that future 3D clients will call.
 */
import { createPersistentSimulation, type PersistentSimulation } from '../core/persistence.ts';
import { spellDefinitions } from '../core/spellcraft.ts';

export function createStarterSchool(): PersistentSimulation {
  const world = createPersistentSimulation();
  const common = world.room('common_room', 'Гостиная Гриффиндора');
  const corridor = world.room('corridor', 'Школьный коридор');
  const classroom = world.room('classroom', 'Кабинет чар');
  const library = world.room('library', 'Библиотека');
  world.connect(common, corridor);
  world.connect(corridor, classroom);
  world.connect(corridor, library);

  const james = world.character('james', 'Джеймс Поттер', common);
  const lily = world.character('lily', 'Лили Эванс', classroom);
  const remus = world.character('remus', 'Ремус Люпин', library);
  const peter = world.character('peter', 'Питер Петтигрю', common);
  const professor = world.character('professor', 'Преподаватель чар', classroom);

  world.seedSpellKnowledge(professor, 'lumos', 'independent');
  // The player follows the same knowledge, time and attendance rules as NPCs,
  // but their action source is the terminal rather than an autonomous policy.
  world.setManualControl(james, true);
  const lumos = {
    id: 'lumos', subject: 'Чары: свет',
    room: classroom, startsAt: 510, endsAt: 550,
    spell: 'lumos' as const
  };
  world.setTimetable(james, [lumos], 'lesson_first');
  world.setTimetable(lily, [lumos], 'lesson_first');
  world.setTimetable(remus, [lumos], 'lesson_first');
  world.setHelpful(lily, true);
  world.setHelpSeeking(remus, true);
  world.setTrust(remus, lily, 'trusted');
  world.setRoutine(peter, [library]);
  // 31.11: the player may negotiate a concrete meeting with a real NPC.
  // Peter's reply comes from the ordinary scheduler, not the text adapter.
  world.setDailyLife(peter,{
    homeRoom:common,diningRoom:common,socialRoom:common,
    style:'outgoing',interest:'castle',socialInvitations:true,
    relationshipLearning:true,contextualRelationships:true
  });
  return world;
}

export function createTextSession(initial = createStarterSchool()) {
  let world = initial;
  const playerKey = 'james';
  const player = () => {
    const id = world.id(playerKey);
    if (id === undefined) throw new Error('Save does not contain the player character');
    return id;
  };
  const keyMap = ['common_room', 'corridor', 'classroom', 'library',
    'james', 'lily', 'remus', 'peter', 'professor'];
  const keyOf = (id: number) => keyMap.find(key => world.id(key) === id) ?? world.label(id);

  function look() {
    const place = world.currentRoom(player());
    if (place === null) return 'Неизвестное местоположение';
    return [
      world.clock().label + ' · ' + world.label(place),
      'Здесь: ' + world.occupants(place).map(id => world.label(id)).join(', '),
      'Выходы: ' + world.exits(place).map(id => keyOf(id) + ' (' + world.label(id) + ')').join(', ')
    ].join('\n');
  }

  function status() {
    const lessons = world.attendance(player()).map(l =>
      l.subject + ': ' + l.status + ' (' + l.startsAt + '–' + l.endsAt + ')');
    return [
      'Время: ' + world.clock().label + ', игровой день ' + world.clock().day,
      'Герой: ' + world.label(player()),
      'Знания: Lumos = ' + world.spellStage(player(), 'lumos'),
      'Занятия: ' + (lessons.join('; ') || 'пока нет'),
      'Пробелы: ' + (world.knowledgeGaps(player()).join(', ') || 'нет'),
      'Свет палочки: ' + (world.isIlluminated(player()) ? 'горит' : 'не горит'),
      'Разговоров: ' + world.conversationHistory(player()).length
    ].join('\n');
  }

  function advance(ticks: number) {
    const before = world.events().length;
    for (let i = 0; i < ticks; i++) world.step();
    return world.events().slice(before);
  }

  function respond(input: string): string {
    const words = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const [action, arg, extra] = words;
    if (!action) return '';
    if (action === 'help') return [
      'look | status | people | go <room> | wait <ticks> | ask <person> lumos',
      'chat <person> <lessons|castle|hobbies> (only same room)',
      'offer <person> <study|explore> | mymeetings (your own memory)',
      'practice lumos <professor> | practice lumos | cast lumos',
      'events | save <file> | load <file> | exit'
    ].join('\n');
    if (action === 'look') return look();
    if (action === 'status') return status();
    if (action === 'people') {
      const place = world.currentRoom(player());
      return place === null ? '' : world.occupants(place).map(id => keyOf(id) + ': ' + world.label(id)).join('\n');
    }
    if (action === 'events') return JSON.stringify(world.events().slice(-10), null, 2);
    if (action === 'mymeetings') {
      const memories=world.promiseHistory(player());
      return memories.length===0?'Ты пока не договаривался о встречах.':
        memories.slice(-12).map(m=>keyOf(m.partner)+': '+m.kind+
          ' / '+m.purpose+' / встреча №'+m.meetingId).join('\n');
    }
    if (action === 'offer') {
      const listener=arg?world.id(arg):undefined;
      if(listener===undefined)return 'Неизвестный собеседник.';
      if(extra!=='study'&&extra!=='explore')return 'Выбери study или explore.';
      const room=world.currentRoom(player());
      if(room===null)return 'Нужно находиться в комнате.';
      const atMinute=(world.clock().day+1)*1440+1180;
      const result=world.execute({type:'offer_meeting',actor:player(),
        listener,room,atMinute,purpose:extra});
      if(!result.ok)return 'Приглашение невозможно: '+result.reason;
      const offered=world.promiseHistory(player()).at(-1)!;
      advance(1);
      const response=world.promiseHistory(player()).findLast(m=>
        m.meetingId===offered.meetingId &&
        (m.kind==='accepted'||m.kind==='declined'));
      return 'Предложение сделано при личной встрече. '+(
        response?.kind==='accepted'?'Собеседник согласился.':
        response?.kind==='declined'?'Собеседник отказался.':
        'Ответа пока нет.')+' Смотри mymeetings.';
    }
    if (action === 'go') {
      const destination = arg ? world.id(arg) : undefined;
      if (destination === undefined) return 'Неизвестный адрес. Напиши look.';
      const result = world.execute({ type: 'move', actor: player(), destination });
      if (!result.ok) return 'Не получилось пройти: ' + result.reason;
      advance(1);
      return look();
    }
    if (action === 'wait') {
      const ticks = Number(arg ?? '1');
      if (!Number.isInteger(ticks) || ticks < 1 || ticks > 144)
        return 'Допустимо ждать от 1 до 144 тиков (по 10 минут).';
      const occurred = advance(ticks);
      return 'Время: ' + world.clock().label +
        '; событий за время ожидания: ' + occurred.length + '\n' + look();
    }
    if (action === 'chat') {
      const listener = arg ? world.id(arg) : undefined;
      if (listener === undefined) return 'Неизвестный собеседник';
      if (extra !== 'lessons' && extra !== 'castle' && extra !== 'hobbies')
        return 'Тема: lessons, castle или hobbies';
      const result = world.execute({ type: 'chat', actor: player(), listener, topic: extra });
      if (!result.ok) return 'Разговор не состоялся: ' + result.reason;
      advance(1);
      return 'Вы поговорили. Общая история сохранена. ' +
        'Беседы: ' + world.conversationHistory(player()).length;
    }
    if (action === 'ask') {
      if (extra !== 'lumos') return 'Сейчас можно спрашивать только о Lumos.';
      const listener = arg ? world.id(arg) : undefined;
      if (listener === undefined) return 'Неизвестный персонаж';
      const result = world.execute({ type: 'ask_tutoring', actor: player(), listener, spell: 'lumos' });
      if (!result.ok) return 'Нельзя попросить: ' + result.reason;
      advance(1);
      return 'Ты попросил объяснить Lumos. Результат: ' + world.spellStage(player(), 'lumos');
    }
    if (action === 'practice' || action === 'cast') {
      if (arg !== 'lumos') return 'Пока доступен только Lumos.';
      const guide = extra ? world.id(extra) : undefined;
      if (extra && guide === undefined) return 'Неизвестный наставник';
      const definition = spellDefinitions.lumos;
      const magic = {
        actor: player(), spell: 'lumos' as const, intent: definition.intent,
        target: definition.semanticTarget, incantation: definition.incantation
      };
      const command = action === 'practice'
        ? { type: 'practice_spell' as const, ...magic, ...(guide === undefined ? {} : { guide }) }
        : { type: 'cast_spell' as const, ...magic };
      const result = world.execute(command);
      if (!result.ok) return 'Заклинание не получилось: ' + result.reason;
      advance(1);
      return 'Lumos: ' + world.spellStage(player(), 'lumos') +
        '; свет=' + world.isIlluminated(player());
    }
    if (action === 'save' || action === 'load') return 'Команду ' + action + ' обслуживает терминал; укажи имя файла.';
    return 'Неизвестная команда. Напиши help.';
  }

  function replaceWorld(loaded: PersistentSimulation) {
    if (loaded.id(playerKey) === undefined) throw new Error('Это сохранение другого сценария');
    world = loaded;
  }

  return { respond, look, status, replaceWorld, world: () => world };
}
