/**
 * [GAME] G5.1 isolated narrative CLI over the existing real text-game world.
 * World-changing commands are handled by createTextSession, never by the LLM.
 *
 * npm run narrative-play                       (offline mock)
 * OPENAI_API_KEY=... npm run narrative-live    (real paid API)
 */
import {createInterface} from 'node:readline';
import {readFile,writeFile} from 'node:fs/promises';
import {createTextSession} from './text-game.ts';
import {restoreSimulation,serializeCheckpoint} from '../core/persistence.ts';
import {NarrativeBridge} from '../narrative/bridge.ts';
import {MockNarrativeProvider,OpenAINarrativeProvider} from '../narrative/provider.ts';

const live=process.argv.includes('--live');
const provider=live?new OpenAINarrativeProvider():new MockNarrativeProvider();
const bridge=new NarrativeBridge(provider,{
  'Лили Эванс':'[GAME] Умная, внимательная, любознательная, принципиальная, независимая. Может не соглашаться с собеседником.',
  'Ремус Люпин':'[GAME] Вдумчивый, сдержанный, доброжелательный; предпочитает не делать громких заявлений.',
  'Питер Петтигрю':'[GAME] Осторожный, наблюдательный; ищет принятия в компании друзей.',
  'Преподаватель чар':'[GAME] Преподаватель, внимательный к технике и проверяемым знаниям.'
});
const session=createTextSession();
const player=()=>session.world().id('james')!;

function help(){
  return [
    'Обычные команды: look | people | status | go <room> | wait <ticks> | help',
    '                   chat <person> <lessons|castle|hobbies> | ask <person> lumos',
    '                   practice lumos <professor> | save <file> | load <file> | exit',
    'LLM-команды: scene  — художественное описание лично наблюдаемого;',
    '              say <person> <твой текст> — реплика находящемуся рядом NPC.',
    'Пример: go corridor; go classroom; say lily Лили, расскажи про Люмос!',
    'Свободная речь НЕ меняет ECS: никаких обещаний, перемещений и знаний от LLM.',
    'Сейчас: '+(live?'OpenAI API, реальные платные запросы':'локальный mock, без сети')
  ].join('\n');
}

async function handle(input:string):Promise<string>{
  const line=input.trim();
  if(line==='scene')return bridge.scene(session.world(),player());
  const match=/^say\s+([a-z_]+)\s+([\s\S]+)$/i.exec(line);
  if(match){
    const target=session.world().id(match[1]!.toLowerCase());
    if(target===undefined)return 'Неизвестный персонаж. Напиши people.';
    return bridge.talk(session.world(),player(),target,match[2]!);
  }
  const save=/^(save|load)\s+(.+)$/i.exec(line);
  if(save){
    const file=save[2]!.trim();
    if(save[1]!.toLowerCase()==='save'){
      await writeFile(file,serializeCheckpoint(session.world()),'utf8');
      return 'Мир сохранён: '+file+' (LLM-реплики пока не сохраняются).';
    }
    const restored=restoreSimulation(await readFile(file,'utf8'));
    session.replaceWorld(restored);
    bridge.clear();
    return 'Мир восстановлен: '+session.status();
  }
  if(line==='help'||line==='?')return help();
  const result=session.respond(line);
  if(/^(go|wait)\b/i.test(line))bridge.clear();
  return result;
}

if(process.argv.includes('--demo')){
  console.log(help());
  console.log('> scene\n'+await handle('scene'));
  console.log('> go corridor\n'+await handle('go corridor'));
  console.log('> go classroom\n'+await handle('go classroom'));
  console.log('> say lily Привет, Лили! Как дела с чарами?');
  console.log(await handle('say lily Привет, Лили! Как дела с чарами?'));
} else {
  console.log('МАРОДЁРЫ / G5.1 Narrative Bridge — '+(live?'LIVE':'MOCK'));
  console.log(help());
  console.log(session.look());
  const rl=createInterface({input:process.stdin,output:process.stdout,prompt:'> '});
  rl.prompt();
  for await(const line of rl){
    if(['exit','quit'].includes(line.trim().toLowerCase()))break;
    try{console.log(await handle(line));}
    catch(error){console.log('Ошибка: '+(error instanceof Error?error.message:String(error)));}
    rl.prompt();
  }
  rl.close();
}
