/* G5.1: a thin interactive inspector. This browser never receives secrets or full ECS snapshots. */
const $=id=>document.getElementById(id);
let state=null;
let working=false;

function node(tag,className,text){
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(text!==undefined)el.textContent=String(text);
  return el;
}
function message(who,body,style='system'){
  const item=node('div','entry '+style);
  item.append(node('div','byline',who),node('div','body',body));
  $('log').append(item);
  while($('log').children.length>60)$('log').firstElementChild.remove();
  $('log').scrollTop=$('log').scrollHeight;
}
function blank(container,text){
  container.append(node('div','empty',text));
}
function stat(container,left,right){
  const row=node('div','stat');
  row.append(node('strong','',left),node('span','value',right));
  container.append(row);
}
function actionButton(container,title,action,enabled=true){
  const button=node('button','',title);
  button.disabled=!enabled||working;
  button.addEventListener('click',()=>run(action,title));
  container.append(button);
  return button;
}
function show(selector,children){
  const target=$(selector);
  target.replaceChildren(...children);
}
function render(newState){
  state=newState;
  $('player').textContent=state.player;
  $('time').textContent=state.time+' · день '+state.day;
  $('mode').textContent=state.mode==='openai'?'OPENAI · платные запросы':'MOCK · бесплатно';
  $('mode').classList.toggle('live',state.mode==='openai');
  $('room').textContent=state.room.label;
  $('atmosphere').textContent=state.room.atmosphere;
  $('light').textContent=state.lit?'Палочка освещена чарами Люмос.':'Палочка пока не светится.';
  $('perceived').textContent=[
    state.view.people.length?'Сейчас ты видишь: '+state.view.people.join(', ')+'.':'Рядом нет видимых собеседников.',
    state.view.books.length?'Видимые книги: '+state.view.books.join(', ')+'.':''
  ].filter(Boolean).join(' ');
  $('describe').disabled=working;

  const lessons=[];
  if(state.lessons.length===0)blank({append:e=>lessons.push(e)},'Расписание пока пусто.');
  else for(const lesson of state.lessons){
    const block=node('div','stat');
    const meta=node('div');
    meta.append(node('div','',lesson.subject),node('div','tiny',lesson.room));
    block.append(meta,node('span','chip',lesson.status));
    lessons.push(block);
  }
  show('lessons',lessons);

  const skills=[];
  for(const skill of state.skills){
    const block=node('div','stat');
    block.append(node('span','',skill.incantation),node('span','chip',skill.stage));
    skills.push(block);
  }
  show('skills',skills);
  $('gaps').textContent=state.knowledgeGaps.length
    ?'Пробелы в изученном: '+state.knowledgeGaps.join(', ')
    :'Записанных пробелов пока нет.';

  const memories=[];
  for(const m of state.social.conversations){
    memories.push(node('div','help-line','Разговор с '+m.with+' о '+m.topic+'.'));
  }
  for(const m of state.social.commitments){
    memories.push(node('div','help-line',m.kind+' / '+m.purpose+' · '+m.with));
  }
  if(!memories.length)memories.push(node('div','empty','Пока нет записанных встреч и бесед.'));
  show('memory',memories);

  const exits=[];
  for(const exit of state.exits)actionButton({append:e=>exits.push(e)},'➜ '+exit.label,
    {kind:'move',target:exit.key});
  if(!exits.length)exits.push(node('div','empty','Нет известных проходов.'));
  show('exits',exits);

  const people=[];
  for(const person of state.people){
    const card=node('div','person');
    card.append(node('span','person-name','◉ '+person.label));
    const buttons=node('div','person-actions');
    actionButton(buttons,'Обратиться', {kind:'choose',target:person.key},person.canTalk);
    actionButton(buttons,'Беседа об уроках',{kind:'chat',target:person.key,topic:'lessons'},person.canTalk);
    actionButton(buttons,'Попросить про Lumos',{kind:'ask',target:person.key},person.canTalk);
    actionButton(buttons,'Пригласить учиться',{kind:'offer',target:person.key,purpose:'study'},person.canTalk);
    card.append(buttons);
    people.push(card);
  }
  if(!people.length)people.push(node('div','empty','Никого не видно.'));
  show('people',people);

  const books=[];
  for(const book of state.books){
    const row=node('div','person');
    row.append(node('div','person-name','▤ '+book.label));
    actionButton(row,'Начать чтение',{kind:'study',book:book.key});
    books.push(row);
  }
  if(!books.length)books.push(node('div','empty','Видимых книг рядом нет.'));
  show('books',books);

  const actions=[];
  actionButton({append:e=>actions.push(e)},'⏳ Подождать 10 минут',{kind:'wait',ticks:1});
  actionButton({append:e=>actions.push(e)},'⏳ Подождать 30 минут',{kind:'wait',ticks:3});
  actionButton({append:e=>actions.push(e)},'✦ Применить Lumos',{kind:'cast'},
    state.capabilities.castLumos);
  actionButton({append:e=>actions.push(e)},'✦ Практиковать Lumos',{kind:'practice'});
  if(state.people.some(p=>p.key==='professor'))
    actionButton({append:e=>actions.push(e)},'✦ Практика с профессором',
      {kind:'practice',guide:'professor'});
  show('actions',actions);

  const options=[];
  for(const person of state.people.filter(p=>p.canTalk)){
    const opt=document.createElement('option');
    opt.value=person.key;
    opt.textContent=person.label;
    options.push(opt);
  }
  const chosen=$('npc').value;
  $('npc').replaceChildren(...options);
  if(options.some(o=>o.value===chosen))$('npc').value=chosen;
  const canTalk=options.length>0;
  $('npc').disabled=!canTalk||working;
  $('utterance').disabled=!canTalk||working;
  $('say').disabled=!canTalk||working;
  $('utterance').placeholder=canTalk
    ?'Напиши реплику. Для настоящих действий используй кнопки справа.'
    :'Рядом нет доступного собеседника.';
  const help=state.help.map(text=>node('p','help-line','• '+text));
  show('help',help);
}
async function api(path,options){
  const response=await fetch(path,options);
  const json=await response.json();
  if(!response.ok)throw Error(json.error||'Ошибка сервера');
  return json;
}
async function run(action,label){
  if(action.kind==='choose'){
    $('npc').value=action.target;
    $('utterance').focus();
    return;
  }
  if(working)return;
  if(action.kind==='speak'&&!action.text.trim())return;
  working=true;
  $('indicator').textContent='Мир обрабатывает действие…';
  if(state)render(state);
  try{
    const result=await api('/api/action',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action})
    });
    message(label,result.message,action.kind==='speak'?'npc':'system');
    render(result.state);
    $('indicator').textContent='Мир обновлён · '+result.state.time;
  }catch(error){
    message('Действие отклонено',String(error.message??error),'error');
    $('indicator').textContent='Действие не выполнено';
  }finally{
    working=false;
    if(state)render(state);
  }
}
$('talk-form').addEventListener('submit',event=>{
  event.preventDefault();
  const target=$('npc').value,text=$('utterance').value.trim();
  if(!target||!text)return;
  message('Ты → '+$('npc').selectedOptions[0].textContent,text,'player');
  $('utterance').value='';
  run({kind:'speak',target,text},'Ответ');
});
$('utterance').addEventListener('keydown',event=>{
  if(event.key==='Enter'&&!event.shiftKey){
    event.preventDefault();
    $('talk-form').requestSubmit();
  }
});
$('describe').addEventListener('click',()=>run({kind:'describe'},'Окружение · рассказчик'));
$('save').addEventListener('click',async()=>{
  try{
    const response=await fetch('/api/save');
    if(!response.ok)throw Error('Сохранить не удалось');
    const blob=await response.blob();
    const link=document.createElement('a');
    link.href=URL.createObjectURL(blob);
    link.download='hogwarts-g5-checkpoint.json';
    link.click();
    setTimeout(()=>URL.revokeObjectURL(link.href),2000);
    message('Сохранение','Мир выгружен в файл. Текст бесед с mock/LLM не сохраняется.');
  }catch(error){message('Ошибка',String(error),'error');}
});
$('load').addEventListener('change',async event=>{
  const file=event.target.files?.[0];
  if(!file)return;
  if(file.size>1_500_000){message('Ошибка','Файл слишком большой.','error');return;}
  if(working)return;
  working=true;
  try{
    const response=await api('/api/load',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({checkpoint:await file.text()})
    });
    $('log').replaceChildren();
    render(response.state);
    message('Сохранение',response.message);
  }catch(error){message('Ошибка загрузки',String(error.message??error),'error');}
  finally{working=false;event.target.value='';if(state)render(state);}
});
(async()=>{
  try{
    render(await api('/api/state'));
    message('Добро пожаловать',
      'Это локальная текстовая игра на реальной ECS. Осмотрись, выбери выход или собеседника. MOCK не понимает произвольную речь: для Lumos предусмотрен проверяемый сценарный ответ.');
    $('indicator').textContent='Мир запущен · без фоновых вызовов LLM';
  }catch(error){
    $('indicator').textContent='Не удалось подключиться к локальному миру';
    message('Ошибка подключения',String(error.message??error),'error');
  }
})();
