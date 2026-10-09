import { createSimulation } from '../core/Simulation.ts';

function demonstrate(priority: 'school_first'|'promise_first') {
  const world=createSimulation();
  const common=world.room('common','Гостиная');
  const library=world.room('library','Библиотека');
  const classroom=world.room('classroom','Кабинет чар');
  world.connect(common,library);
  world.connect(common,classroom);
  const remus=world.character('remus','Ремус',common);
  const student=world.character('student','Первокурсник',common);
  world.setDailyLife(remus,{
    homeRoom:common,diningRoom:common,style:'reserved',
    interest:'lessons',commitmentPriority:priority
  });
  world.setDailyLife(student,{
    homeRoom:common,diningRoom:common,style:'outgoing',
    interest:'lessons',commitmentPriority:'promise_first'
  });
  world.setTimetable(remus,[{
    id:'charms',subject:'Чары',room:classroom,startsAt:520,endsAt:580
  }]);
  const request=world.execute({
    type:'promise_meeting',actor:remus,listener:student,
    room:library,atMinute:540,purpose:'study'
  });
  if(!request.ok) throw new Error('Meeting promise rejected: '+request.reason);
  for(let i=0;i<12;i++)world.step();
  const meeting=world.meetingLedger()[0]!;
  console.log(JSON.stringify({
    priority,meeting:meeting.status,
    remusClass:world.attendance(remus)[0]?.status,
    studentMemory:world.promiseHistory(student).map(x=>x.kind),
    remusMemory:world.promiseHistory(remus).map(x=>x.kind),
    meetingEvents:world.events().filter(x=>x.type==='meeting_resolved').length
  }));
}
console.log('Experiment #15 / Письмо в библиотеку, обещания и выбор');
demonstrate('school_first');
demonstrate('promise_first');
