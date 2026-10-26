/** [GAME] Local-only browser shell for the existing G5.1 ECS text world. */
import {createServer,type Server,type IncomingMessage,type ServerResponse} from 'node:http';
import {readFile} from 'node:fs/promises';
import {NarrativeBridge} from '../narrative/bridge.ts';
import {MockNarrativeProvider,OpenAINarrativeProvider} from '../narrative/provider.ts';
import {createNarrativeWebSession,type UiAction} from '../narrative/web-session.ts';

const live=process.argv.includes('--live');
const portArg=Number(process.env.MARAUDERS_TEXT_PORT??'4177');
const files={
  '/':new URL('../../web/narrative.html',import.meta.url),
  '/narrative.css':new URL('../../web/narrative.css',import.meta.url),
  '/narrative.js':new URL('../../web/narrative.js',import.meta.url)
} as const;
const mime:Record<string,string>={
  '/':'text/html; charset=utf-8',
  '/narrative.css':'text/css; charset=utf-8',
  '/narrative.js':'text/javascript; charset=utf-8'
};
function send(response:ServerResponse,code:number,body:string,type='application/json; charset=utf-8'){
  response.writeHead(code,{
    'Content-Type':type,
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'Cross-Origin-Resource-Policy':'same-origin'
  });
  response.end(body);
}
async function readBody(req:IncomingMessage,max=1_500_000):Promise<string>{
  let text='';
  for await(const fragment of req){
    text+=fragment.toString();
    if(text.length>max)throw Error('Слишком большой запрос');
  }
  return text;
}
export function makeNarrativeHttpServer(options:{
  app?:ReturnType<typeof createNarrativeWebSession>;
  port?:number;
}={}):{server:Server; listen:()=>Promise<string>} {
  const app=options.app??createNarrativeWebSession({
    mode:live?'openai':'mock',
    provider:live?new OpenAINarrativeProvider():new MockNarrativeProvider()
  });
  let busy=false;
  const server=createServer(async(req,res)=>{
    const path=req.url?.split('?')[0]??'';
    const addr=req.headers.host??'';
    const permitted=/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(addr);
    if(!permitted) {send(res,403,JSON.stringify({error:'Только localhost'}));return;}
    const origin=req.headers.origin;
    if(origin&&origin!=='http://'+addr){send(res,403,JSON.stringify({error:'Неверный origin'}));return;}
    try{
      if(req.method==='GET'&&path in files){
        const asset=files[path as keyof typeof files];
        send(res,200,await readFile(asset,'utf8'),mime[path]!);
        return;
      }
      if(req.method==='GET'&&path==='/api/state'){
        send(res,200,JSON.stringify(app.state()));return;
      }
      if(req.method==='GET'&&path==='/api/save'){
        res.setHeader('Content-Disposition','attachment; filename="hogwarts-g5-checkpoint.json"');
        send(res,200,app.save());return;
      }
      if(req.method==='POST'&&(path==='/api/action'||path==='/api/load')){
        if(busy){send(res,409,JSON.stringify({error:'Предыдущее действие ещё выполняется'}));return;}
        busy=true;
        try {
          if(req.headers['content-type']?.split(';')[0]!=='application/json'){
            send(res,415,JSON.stringify({error:'Требуется JSON'}));return;
          }
          const body=JSON.parse(await readBody(req));
          if(!body||typeof body!=='object'||Array.isArray(body)){
            send(res,400,JSON.stringify({error:'Ожидается объект JSON'}));return;
          }
          if(path==='/api/load'){
            if(typeof body.checkpoint!=='string')throw Error('Нужен checkpoint');
            app.load(body.checkpoint);
            send(res,200,JSON.stringify({message:'Сохранение восстановлено.',state:app.state()}));
            return;
          }
          if(!body.action||typeof body.action!=='object'||typeof body.action.kind!=='string')
            throw Error('Неизвестный формат действия');
          const result=await app.dispatch(body.action as UiAction);
          send(res,200,JSON.stringify({message:result,state:app.state()}));
        }finally{busy=false;}
        return;
      }
      send(res,404,JSON.stringify({error:'Не найдено'}));
    }catch(e){
      const message=e instanceof Error?e.message:'Ошибка';
      // Don't echo upstream response data, stack traces, or any credential.
      send(res,400,JSON.stringify({error:message.slice(0,300)}));
    }
  });
  return {
    server,
    listen:()=>new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(options.port??portArg,'127.0.0.1',()=>{
        server.off('error',reject);
        const address=server.address();
        const actual=address&&typeof address==='object'?address.port:portArg;
        resolve('http://127.0.0.1:'+actual+'/');
      });
    })
  };
}

if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url){
  if(!Number.isSafeInteger(portArg)||portArg<1||portArg>65535)
    throw Error('MARAUDERS_TEXT_PORT must be a valid port');
  const service=makeNarrativeHttpServer();
  const address=await service.listen();
  console.log('G5.1 Текстовый Хогвартс: '+address);
  console.log(live?'Режим OPENAI: каждый запрос речи/описания оплачивается отдельно.':
    'Режим MOCK: без ключа и сети; диалоги сценарные, не LLM.');
  console.log('Открой адрес в браузере; Ctrl+C — остановить.');
}
