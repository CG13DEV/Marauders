/**
 * [GAME] Experiment 27: separate allocation of *actual* school resources.
 * A reproducible heuristic, not an exhaustive CSP/SAT solver. If allocation
 * fails we report the missing constraint rather than silently dropping classes.
 * Teaching programs are not claims about the 1971 historical timetable.
 */
import type {CoreSubject} from './curriculum.ts';

export type FoundationSubject=CoreSubject|'Flying';
export type FoundationGroup={
  id:string;year:1|2;students:readonly number[];
};
export type FoundationTeacher={
  id:number;subject:FoundationSubject;maxPeriods:number;
};
export type FoundationSpace={
  id:number;subjects:readonly FoundationSubject[];capacity:number;
};
export type FoundationSlot={startsAt:number;endsAt:number;day:number};
export type FoundationAssignment={
  groupId:string;students:readonly number[];subject:FoundationSubject;
  teacher:number;room:number;startsAt:number;endsAt:number;
};
export type ExistingBooking={
  teacher:number;room:number;students:readonly number[];
  startsAt:number;endsAt:number;
};
export const FOUNDATION_PROFILE:Readonly<Record<1|2,Readonly<Partial<Record<FoundationSubject,number>>>>>={
  1:{Charms:3,Transfiguration:3,Potions:3,Herbology:3,
    'Defense Against the Dark Arts':3,'History of Magic':2,Astronomy:2,Flying:1},
  2:{Charms:3,Transfiguration:3,Potions:3,Herbology:3,
    'Defense Against the Dark Arts':3,'History of Magic':2,Astronomy:2}
};
export const FOUNDATION_STARTS=[540,600,660,780,840,900] as const;
export const FOUNDATION_TEACHER_LIMIT=20;
export const FOUNDATION_ROOM_CAPACITY=24;
export const FOUNDATION_SUBJECTS=Object.keys(FOUNDATION_PROFILE[1]) as FoundationSubject[];

export function weeklyFoundationSlots():FoundationSlot[]{
  return Array.from({length:5},(_,day)=>FOUNDATION_STARTS.map(hour=>({
    startsAt:day*1440+hour,endsAt:day*1440+hour+50,day
  }))).flat();
}
const intersect=(a:ExistingBooking,b:ExistingBooking)=>
  a.startsAt<b.endsAt&&b.startsAt<a.endsAt;

export function planFoundationTimetable(args:{
  groups:readonly FoundationGroup[];
  teachers:readonly FoundationTeacher[];
  spaces:readonly FoundationSpace[];
  slots:readonly FoundationSlot[];
  existing?:readonly ExistingBooking[];
}):FoundationAssignment[]{
  const {groups,teachers,spaces,slots,existing=[]}=args;
  const unique=(ids:readonly (number|string)[],what:string)=>{
    if(new Set(ids).size!==ids.length)throw Error('Duplicate '+what);
  };
  unique(groups.map(g=>g.id),'group ID');
  unique(teachers.map(t=>t.id),'teacher ID');
  unique(spaces.map(s=>s.id),'room ID');
  unique(slots.map(s=>s.startsAt),'slot start');
  for(const slot of slots)
    if(slot.startsAt>=slot.endsAt||slot.day!==Math.floor(slot.startsAt/1440))
      throw Error('Invalid teaching slot');
  const demand=new Map<FoundationSubject,number>();
  for(const group of groups){
    if(group.students.length===0)throw Error('Empty class: '+group.id);
    unique(group.students,'student in '+group.id);
    for(const [subject,count] of Object.entries(FOUNDATION_PROFILE[group.year]) as
      [FoundationSubject,number][]){
      demand.set(subject,(demand.get(subject)??0)+count);
    }
  }
  const load=new Map<number,number>();
  for(const teacher of teachers){
    if(!Number.isSafeInteger(teacher.maxPeriods)||teacher.maxPeriods<1)
      throw Error('Invalid teacher workload limit');
    load.set(teacher.id,existing.filter(e=>e.teacher===teacher.id).length);
  }
  for(const [subject,count] of demand){
    const staff=teachers.filter(t=>t.subject===subject);
    const capacity=staff.reduce((n,t)=>n+Math.max(0,t.maxPeriods-(load.get(t.id)??0)),0);
    if(capacity<count)throw Error('Insufficient '+subject+' teachers: '+count+
      ' periods required, '+capacity+' available');
    if(!spaces.some(r=>r.subjects.includes(subject)&&r.capacity>=
      Math.max(...groups.map(g=>g.students.length))))
      throw Error('No compatible classroom of sufficient capacity for '+subject);
  }
  const sortedSlots=[...slots].sort((a,b)=>a.startsAt-b.startsAt);
  const days=[...new Set(sortedSlots.map(s=>s.day))].sort((a,b)=>a-b);
  const bookings:ExistingBooking[]=existing.map(e=>({...e,students:[...e.students]}));
  const result:FoundationAssignment[]=[];
  for(let groupIndex=0;groupIndex<groups.length;groupIndex++){
    const group=groups[groupIndex]!;
    const profile=FOUNDATION_PROFILE[group.year];
    const total=Object.values(profile).reduce((a,b)=>a+(b??0),0);
    if(sortedSlots.length<total)throw Error('Insufficient weekly slots for '+group.id);
    const targetDaily=days.map((_,i)=>
      Math.floor(total/days.length)+(i<total%days.length?1:0));
    if(days.some((day,i)=>
      sortedSlots.filter(s=>s.day===day).length<targetDaily[i]!))
      throw Error('Insufficient daily slots for '+group.id);
    const perDay=new Map(days.map(day=>[day,[] as FoundationSubject[]]));
    // Distribute distinct subject occurrences across days before allocating
    // teachers and rooms; lessons of one subject never all bunch on one day.
    for(const [subject,count] of Object.entries(profile) as [FoundationSubject,number][]){
      for(let occurrence=0;occurrence<count;occurrence++){
        const ranked=days.map((day,di)=>({
          day,di,
          used:perDay.get(day)!.length,
          target:targetDaily[di]!,
          previous:perDay.get(day)!.includes(subject),
          tie:(di-groupIndex-occurrence+days.length*100)%days.length
        })).filter(d=>d.used<d.target&&!d.previous)
          .sort((a,b)=>a.used-b.used||a.tie-b.tie||a.day-b.day);
        if(!ranked.length)throw Error('Cannot distribute '+subject+' for '+group.id);
        perDay.get(ranked[0]!.day)!.push(subject);
      }
    }
    for(const day of days){
      const pending=[...perDay.get(day)!];
      const groupBookings=result.filter(a=>a.groupId===group.id);
      // Harder-to-place subjects first, but prefer distinct days and slots.
      pending.sort((a,b)=>{
        const aCapacity=teachers.filter(t=>t.subject===a).length;
        const bCapacity=teachers.filter(t=>t.subject===b).length;
        return aCapacity-bCapacity||
          FOUNDATION_SUBJECTS.indexOf(a)-FOUNDATION_SUBJECTS.indexOf(b);
      });
      for(const subject of pending){
        const candidates: {slot:FoundationSlot;teacher:FoundationTeacher;
          space:FoundationSpace;score:number}[]=[];
        for(const slot of sortedSlots.filter(s=>s.day===day)){
          if(groupBookings.some(b=>intersect(b,{...slot,teacher:0,room:0,students:[]})))
            continue;
          if(bookings.some(b=>intersect(b,{...slot,teacher:0,room:0,
            students:group.students})&&
            b.students.some(id=>group.students.includes(id))))continue;
          for(const teacher of teachers.filter(t=>t.subject===subject)){
            if((load.get(teacher.id)??0)>=teacher.maxPeriods)continue;
            if(bookings.some(b=>b.teacher===teacher.id&&
              intersect(b,{...slot,teacher:teacher.id,room:0,students:[]})))continue;
            for(const space of spaces){
              if(!space.subjects.includes(subject)||space.capacity<group.students.length)
                continue;
              if(bookings.some(b=>b.room===space.id&&intersect(b,{
                ...slot,teacher:0,room:space.id,students:[]})))continue;
              const simultaneous=bookings.filter(b=>intersect(b,{
                ...slot,teacher:0,room:0,students:[]})).length;
              const local=groupBookings.filter(b=>b.startsAt>=day*1440&&
                b.startsAt<(day+1)*1440);
              const gaps=local.length?Math.min(...local.map(b=>
                Math.abs(slot.startsAt-b.startsAt))):0;
              const score=simultaneous*10+
                (load.get(teacher.id)??0)*0.1+
                // Spread pupils across a day instead of stacking adjacent classes.
                (gaps!==0&&gaps<120?2:0)+
                ((slot.startsAt/60+groupIndex)%6)*0.01;
              candidates.push({slot,teacher,space,score});
            }
          }
        }
        candidates.sort((a,b)=>a.score-b.score||
          a.slot.startsAt-b.slot.startsAt||a.teacher.id-b.teacher.id||
          a.space.id-b.space.id);
        const choice=candidates[0];
        if(!choice)throw Error('Cannot allocate '+subject+' for '+group.id+
          ' on school day '+day+': no free teacher, room and time');
        const assignment:FoundationAssignment={
          groupId:group.id,students:[...group.students],subject,
          teacher:choice.teacher.id,room:choice.space.id,
          startsAt:choice.slot.startsAt,endsAt:choice.slot.endsAt
        };
        bookings.push(assignment);
        groupBookings.push(assignment);
        result.push(assignment);
        load.set(choice.teacher.id,(load.get(choice.teacher.id)??0)+1);
      }
    }
  }
  return result.sort((a,b)=>a.startsAt-b.startsAt||
    a.groupId.localeCompare(b.groupId)||a.subject.localeCompare(b.subject));
}
