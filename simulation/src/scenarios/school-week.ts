/**
 * [GAME] One academic week with reusable subject rooms, teacher-owned sessions,
 * cross-house learning groups and individual upper-year elective choices.
 * Scheduling rules deliberately do NOT live in ECS or castle topology.
 */
import { createSimulation } from '../core/Simulation.ts';
import type { Lesson } from '../core/school-time.ts';
import { createCastleLayout } from './castle-layout.ts';
import { createCastleResidents, NAMED_STAFF } from './castle-residents.ts';
import {
  HOUSES, SUBJECTS, ELECTIVES, HOUSE_LABELS, SUBJECT_LABELS, electiveChoices,
  type House, type CoreSubject, type ElectiveSubject, type Subject
} from './curriculum.ts';
import {cohortSize,dormGroupFor,RESEARCH_DORM_CAPACITY,
  RESEARCH_SCHOOL_POPULATION} from './school-population.ts';
import {planFoundationTimetable,FOUNDATION_PROFILE,FOUNDATION_SUBJECTS,
  FOUNDATION_STARTS,FOUNDATION_ROOM_CAPACITY,FOUNDATION_TEACHER_LIMIT,
  type FoundationSubject,type FoundationTeacher,type FoundationSpace,
  type FoundationAssignment,weeklyFoundationSlots} from './foundation-timetable.ts';

export { HOUSES, SUBJECTS, ELECTIVES } from './curriculum.ts';
export const SCHOOL_WEEK_DAYS = 5;
export const CLASS_STARTS = [9 * 60, 11 * 60, 14 * 60] as const;
export const PUPILS_PER_HOUSE_PER_YEAR = 3;

/**
 * [GAME] Deterministic population gates. Existing three-argument calls remain
 * unchanged; 'control' is the backward-compatible experiment #19 school.
 */
export const INTENTION_ROLLOUT_STAGES = [
  'control','12-pupils','24-pupils','84-pupils','96-all'
] as const;
export type IntentionRolloutStage = typeof INTENTION_ROLLOUT_STAGES[number];
export function rolloutPopulation(stage:IntentionRolloutStage) {
  const pupils=stage==='control'?0:
    stage==='12-pupils'?12:stage==='24-pupils'?24:84;
  return {pupils,teachers:stage==='96-all'?12:0};
}


export type Student = {
  id: number;
  key: string;
  house: House;
  year: number;
  dormGroup: 'girls' | 'boys';
  dormRoom:number;
  groupId: string;
  electives: readonly ElectiveSubject[];
};
export type Teacher = { id: number; subject: Subject | 'Flying' };
export type TeachingGroup = {
  id: string;
  year: number;
  houses: readonly House[];
  students: number[];
};
export type TeachingSession = {
  id: string;
  subject: Subject | 'Flying';
  teacher: number;
  room: number;
  startsAt: number;
  endsAt: number;
  groupId: string;
  students: readonly number[];
};

export function createSchoolWeek(
  world = createSimulation(),
  planning: 'adaptive' | 'legacy' = 'adaptive',
  social: 'autonomous' | 'off' = 'autonomous',
  rollout: IntentionRolloutStage = 'control',
  expansion: 'baseline' | 'expanded' = 'baseline',
  scale: 'fixture-84' | 'research-600' = 'fixture-84',
  curriculum: 'legacy' | 'foundations-27' = 'legacy'
) {
  if(curriculum!=='legacy'&&curriculum!=='foundations-27')
    throw Error('Unknown curriculum');
  if(curriculum==='foundations-27'&&scale!=='research-600')
    throw Error('Foundations curriculum requires the research population');
  if(scale!=='fixture-84'&&scale!=='research-600')
    throw new Error('Unknown school population scale');
  if(!INTENTION_ROLLOUT_STAGES.includes(rollout))
    throw new Error('Unknown intention rollout stage');
  if(expansion !== 'baseline' && expansion !== 'expanded')
    throw new Error('Unknown school expansion');
  const population=scale==='research-600'&&rollout==='96-all'
    ?{pupils:RESEARCH_SCHOOL_POPULATION,teachers:12}
    :rolloutPopulation(rollout);
  const layout = createCastleLayout(world);
  const { hall, greatHall, staffRoom, library, courtyard, hospital,
    classrooms, electiveRooms } = layout;
  const dorms = Object.fromEntries(HOUSES.map(house =>
    [house, layout.dorms[house].common])) as Record<House, number>;
  // The 84-pupil fixture keeps its original shared rooms. At scale, use
  // separate bedrooms by house, year and sex, with a five-pupil capacity.
  const dormitoryRooms=new Map<string,number[]>();
  if(scale==='research-600')for(const house of HOUSES)
    for(let year=1;year<=7;year++)
      for(const sex of ['girls','boys'] as const){
        const count=cohortSize(house,year);
        const occupants=Array.from({length:count},(_,index)=>index)
          .filter(index=>dormGroupFor(index)===sex).length;
        const rooms:number[]=[];
        for(let dorm=0;dorm<Math.ceil(occupants/RESEARCH_DORM_CAPACITY);dorm++){
          const key='research_dorm_'+house+'_y'+year+'_'+sex+'_'+(dorm+1);
          const room=world.room(key,
            HOUSE_LABELS[house]+': '+year+' курс, '+sex+', спальня '+(dorm+1),
            {floor:layout.dorms[house].floor,
             wing:house==='gryffindor'||house==='hufflepuff'?'west':'east',
             kind:'bedroom',house,loreStatus:'GAME'});
          world.connect(layout.dorms[house].common,room);
          rooms.push(room);
        }
        dormitoryRooms.set(year+':'+house+':'+sex,rooms);
      }

  const professors: Teacher[] = [...SUBJECTS, ...ELECTIVES].map((subject, index) => {
    const id = world.character('prof_' + index,
      (expansion === 'expanded' ? NAMED_STAFF[subject] : undefined) ??
        'Преподаватель: ' + SUBJECT_LABELS[subject], staffRoom);
    world.grantPointAuthority(id,'teacher');
    // Ghost Binns still holds the History timetable, but must NOT eat,
    // sleep or accumulate human physiological needs in expanded mode.
    if (expansion !== 'expanded' || subject !== 'History of Magic')
      world.setDailyLife(id, {
      homeRoom: staffRoom, diningRoom: greatHall,
      style: index % 2 === 0 ? 'outgoing' : 'reserved',
      interest: 'lessons',
      ...(population.teachers===12?{intentionPlanning:true}:{ }),
      ...(planning === 'adaptive' ? {schoolPlanning:'adaptive' as const} : {})
    });
    return { id, subject };
  });
  const teachersBySubject = new Map(professors.map(p => [p.subject, p.id]));

  // Cross-house teaching groups share a year and a subject curriculum.
  // Group assignments are [GAME], not an assertion of canonical pairings.
  const teachingGroups: TeachingGroup[] = [];
  for (let year = 1; year <= 7; year++) {
    if(scale==='research-600'){
      for(const house of HOUSES)
        teachingGroups.push({
          id:'y'+year+'_'+house,year,houses:[house],students:[]
        });
    }else for (let pair = 0; pair < 2; pair++) {
      const houses = [HOUSES[pair * 2]!, HOUSES[pair * 2 + 1]!] as const;
      teachingGroups.push({
        id: 'y' + year + '_pair' + pair, year, houses, students: []
      });
    }
  }

  const students: Student[] = [];
  for (let year = 1; year <= 7; year++) {
    for (const house of HOUSES) {
      const cohort=scale==='research-600'?cohortSize(house,year):PUPILS_PER_HOUSE_PER_YEAR;
      for (let index = 0; index < cohort; index++) {
        const key = 'student_y' + year + '_' + house + '_' + (index + 1);
        // Synthetic test population: these slots are not facts about named pupils.
        const dormGroup = scale==='research-600'
          ?dormGroupFor(index)
          :(year + index) % 2 === 0 ? 'girls' : 'boys';
        const sleepingRoom = scale==='research-600'
          ?dormitoryRooms.get(year+':'+house+':'+dormGroup)![
              Math.floor(Math.floor(index/2)/RESEARCH_DORM_CAPACITY)]!
          :layout.dorms[house][dormGroup];
        const id = world.character(key,
          HOUSE_LABELS[house] + ', ' + year + ' курс, ученик ' + (index + 1),
          sleepingRoom);
        world.registerHouse(id,house);
        if(expansion==='expanded'){
          // One bathroom per model floor, selected by each student's usual
          // dormitory facilities. Path choice itself is runtime distance-based.
          const bathrooms=Object.values(layout.bathrooms)
            .map(b=>b[dormGroup]);
          world.configureToilet(id,bathrooms,(year*11+index*13)%40);
        }
        const pair = Math.floor(HOUSES.indexOf(house) / 2);
        const group = scale==='research-600'
          ?teachingGroups[(year-1)*4+HOUSES.indexOf(house)]!
          :teachingGroups[(year - 1) * 2 + pair]!;
        const electives = electiveChoices(year, house, index);
        students.push({ id, key, house, year, dormGroup,
          dormRoom:sleepingRoom,groupId: group.id, electives });
        group.students.push(id);
        world.setDailyLife(id, {
          homeRoom: sleepingRoom, socialRoom: dorms[house],
          diningRoom: greatHall,
          leisureRoom: index % 3 === 0 ? library : index % 3 === 1 ? courtyard : dorms[house],
          style: index % 3 === 2 ? 'reserved' : 'outgoing',
          interest: (['lessons', 'castle', 'hobbies'] as const)[index % 3]!,
          ...(social === 'autonomous' ? { socialInvitations: true } : {}),
          ...(year === 1 ? { learningAppointments: true } : {}),
          ...(students.length<=population.pupils?{intentionPlanning:true}:{}),
          ...(planning === 'adaptive' ? {schoolPlanning:'adaptive' as const} : {})
        });
        // The first year notices their *own* gaps after a missed explanation.
        // They only invite help if social invitations are enabled.
        if(year===1)world.setHelpSeeking(id,true);
      }
    }
  }

  const pupilSchedule = new Map<number, Lesson[]>(
    students.map(student => [student.id, []])
  );
  const staffSchedule = new Map<number, Lesson[]>(
    professors.map(teacher => [teacher.id, []])
  );
  const sessions: TeachingSession[] = [];
  const reservations = new Set<string>();
  const explainedLumosTo = new Set<string>();
  function addSession(
    id: string, subject: Subject, groupId: string,
    students: readonly number[], startsAt: number
  ): void {
    if (!students.length) return;
    const teacher = teachersBySubject.get(subject);
    if (teacher === undefined) throw new Error('Missing subject professor');
    const room = subject in classrooms
      ? classrooms[subject as CoreSubject] : electiveRooms[subject as ElectiveSubject];
    if (room === undefined) throw new Error('Missing subject room');
    const endsAt = startsAt + 50;
    // Rooms and teachers must never be double-booked. Students are checked too.
    for (const [resource, name] of [
      [teacher, 'teacher'], [room, 'room'], ...students.map(student => [student, 'pupil'] as const)
    ] as const) {
      const key = name + ':' + resource + ':' + startsAt;
      if (reservations.has(key)) throw new Error('Schedule collision: ' + key);
      reservations.add(key);
    }
    const session: TeachingSession = { id, subject, teacher, room,
      startsAt, endsAt, groupId, students: [...students] };
    sessions.push(session);
    const groupYear = teachingGroups.find(group => group.id === groupId)?.year;
    // An additional Charms class does not replay the first introduction.
    const introducesLumos = subject === 'Charms' && groupYear === 1 &&
      !explainedLumosTo.has(groupId);
    if (introducesLumos) explainedLumosTo.add(groupId);
    const lesson: Lesson = {
      id, subject: SUBJECT_LABELS[subject], room,
      startsAt, endsAt, groupId, teacher,
      ...(introducesLumos ? { spell: 'lumos' as const } : {})
    };
    staffSchedule.get(teacher)!.push(lesson);
    for (const student of students) pupilSchedule.get(student)!.push(lesson);
  }

  // 84-pupil baseline: 14 cohorts / 15 periods / 105 core sessions.
  // At 600: 28 house-year classes of 20-23, four tracks and six daily
  // periods -> 210 core sessions. A room never holds forty pupils at once.
  const periodStarts=scale==='research-600'
    ?[9*60,10*60,11*60,13*60,14*60,15*60]
    :[...CLASS_STARTS];
  const tracks=scale==='research-600'?4:2;
  for (let day = 0; day < SCHOOL_WEEK_DAYS; day++) {
    for (let slot = 0; slot < periodStarts.length; slot++) {
      const periodIndex = day * periodStarts.length + slot;
      const track = periodIndex % tracks;
      const rotation = Math.floor(periodIndex / tracks);
      const startsAt = day * 1440 + periodStarts[slot]!;
      for (let subjectIndex = 0; subjectIndex < SUBJECTS.length; subjectIndex++) {
        const subject = SUBJECTS[subjectIndex]!;
        const groupIndex = track * 7 + (subjectIndex + rotation) % 7;
        const group = teachingGroups[groupIndex]!;
        if(curriculum==='foundations-27'&&group.year<=2)continue;
        addSession('core_d' + day + '_p' + slot + '_' + group.id,
          subject, group.id, group.students, startsAt);
      }
    }
  }

  // Fifth-, sixth- and seventh-year timetables remain prototype curricula;
  // elective choices are genuinely per pupil from year three onward.
  // Individual year workshops avoid assigning one professor to two ages
  // simultaneously and preserve a separate group identity per subject/level.
  for (let year = 3; year <= 7; year++) {
    const day = year - 3; // one year-specific workshop afternoon
    for (let electiveSlot = 0; electiveSlot < 2; electiveSlot++) {
      const startsAt = day * 1440 + (16 + electiveSlot) * 60;
      for (const subject of ELECTIVES) {
        const attendees = students
          .filter(student => student.year === year && student.electives[electiveSlot] === subject)
          .map(student => student.id);
        addSession('elective_y' + year + '_s' + electiveSlot + '_' +
          ELECTIVES.indexOf(subject), subject, 'elective_y' + year + '_' + subject,
          attendees, startsAt);
      }
    }
  }

  // Experiment #27 is deliberately opt-in: years 1–2 get their complete
  // foundation program, while years 3–7 retain the previous partial fixture.
  // Extra instructors and rooms are *physical* entities, not timetable fiction.
  const foundationTeachers:FoundationTeacher[]=[];
  const foundationSpaces:FoundationSpace[]=[];
  const foundationAssignments:FoundationAssignment[]=[];
  if(curriculum==='foundations-27'){
    for(let subjectIndex=0;subjectIndex<FOUNDATION_SUBJECTS.length;subjectIndex++){
      const subject=FOUNDATION_SUBJECTS[subjectIndex]!;
      const isHeavy=(FOUNDATION_PROFILE[1][subject]??0)>=3;
      const count=isHeavy?2:1;
      const baseRoom=subject==='Flying'
        ?courtyard
        :subject in classrooms
          ?classrooms[subject as CoreSubject]
          :electiveRooms[subject as keyof typeof electiveRooms];
      const descriptor=world.roomInfo(baseRoom);
      if(!descriptor)throw Error('Subject facility not found: '+subject);
      const floor=descriptor.floor;
      const wing=descriptor.wing??'central';
      const landing=layout.landings[floor as keyof typeof layout.landings];
      if(!landing)throw Error('Subject facility has no staircase: '+subject);
      const anchor=subject==='Flying'?courtyard:
        wing==='central'?landing.gallery:landing[wing];
      for(let index=0;index<count;index++){
        const key='foundation_'+subjectIndex+'_'+index;
        const teacher=world.character('foundation_teacher_'+key,
          'Младший преподаватель: '+subject+', '+(index+1),staffRoom);
        world.grantPointAuthority(teacher,'teacher');
        world.setDailyLife(teacher,{
          homeRoom:staffRoom,diningRoom:greatHall,
          style:index%2===0?'reserved':'outgoing',interest:'lessons',
          ...(population.teachers===12?{intentionPlanning:true}:{ }),
          ...(planning==='adaptive'?{schoolPlanning:'adaptive' as const}:{})
        });
        professors.push({id:teacher,subject});
        staffSchedule.set(teacher,[]);
        foundationTeachers.push({
          id:teacher,subject,maxPeriods:FOUNDATION_TEACHER_LIMIT
        });
        const room=world.room('foundation_room_'+key,
          'Учебное пространство '+subject+' №'+(index+1),
          {floor,wing,kind:subject==='Flying'?'courtyard':
            descriptor.kind??'classroom',loreStatus:'GAME'});
        world.connect(anchor,room);
        foundationSpaces.push({
          id:room,subjects:[subject],capacity:FOUNDATION_ROOM_CAPACITY
        });
      }
    }
    const foundationGroups=teachingGroups.filter(g=>g.year<=2).map(g=>({
      id:g.id,year:g.year as 1|2,students:g.students
    }));
    foundationAssignments.push(...planFoundationTimetable({
      groups:foundationGroups,teachers:foundationTeachers,
      spaces:foundationSpaces,slots:weeklyFoundationSlots(),
      existing:sessions
    }));
    for(const assignment of foundationAssignments){
      const id='foundation_'+assignment.groupId+'_'+assignment.subject+'_'+
        assignment.startsAt;
      const introductory=assignment.subject==='Charms'&&
        assignment.groupId.startsWith('y1_')&&
        !explainedLumosTo.has(assignment.groupId);
      if(introductory)explainedLumosTo.add(assignment.groupId);
      const label=assignment.subject==='Flying'
        ?'Полёты'
        :SUBJECT_LABELS[assignment.subject];
      const lesson:Lesson={
        id,subject:label,room:assignment.room,
        startsAt:assignment.startsAt,endsAt:assignment.endsAt,
        groupId:assignment.groupId,teacher:assignment.teacher,
        ...(introductory?{spell:'lumos' as const}:{})
      };
      sessions.push({
        id,subject:assignment.subject,teacher:assignment.teacher,
        room:assignment.room,startsAt:assignment.startsAt,
        endsAt:assignment.endsAt,groupId:assignment.groupId,
        students:[...assignment.students]
      });
      staffSchedule.get(assignment.teacher)!.push(lesson);
      for(const pupil of assignment.students)
        pupilSchedule.get(pupil)!.push(lesson);
    }
  }

  // Keep student and teacher timetables chronological for reproducible queries.
  for (const [id, lessons] of pupilSchedule) {
    lessons.sort((a, b) => a.startsAt - b.startsAt);
    world.setTimetable(id, lessons, 'lesson_first');
  }
  for (const [id, lessons] of staffSchedule) {
    lessons.sort((a, b) => a.startsAt - b.startsAt);
    world.setTimetable(id, lessons, 'lesson_first');
  }

  // Opt-in fixture: named leaders, house heads, spirits and caretaker do not
  // change the experiment #20 population gates or artificial pupil cohorts.
  const residents = expansion === 'expanded'
    ? createCastleResidents(world,layout,professors.filter(
      (p):p is Teacher & {subject:Subject}=>p.subject!=='Flying'
    )):null;

  return {
    world, rollout, population, expansion, scale, curriculum, residents, layout, hall, staffRoom, greatHall, library, courtyard, hospital,
    dorms, dormitoryRooms, classrooms, electiveRooms, professors, students, teachingGroups,
    foundationTeachers,foundationSpaces,foundationAssignments,
    sessions, pupilSchedule, staffSchedule
  };
}

export function reportSchoolWeek(scene: ReturnType<typeof createSchoolWeek>) {
  const { world, students, professors } = scene;
  const counts = { on_time: 0, late: 0, missed: 0, pending: 0 };
  for (const student of students) {
    for (const record of world.attendance(student.id)) counts[record.status]++;
  }
  const active = students.filter(s => world.learningDebt(s.id) > 0);
  const meetings = world.meetingLedger();
  const answers = world.events().filter(e => e.type === 'meeting_answered');
  const houseByPerson = new Map(students.map(pupil => [pupil.id, pupil.house]));
  // Both participants remember each encounter, so divide the counts by two.
  const localEntries = students.flatMap(pupil =>
    world.conversationHistory(pupil.id).map(meeting => ({
      house: pupil.house,
      partnerHouse: houseByPerson.get(meeting.partner)
    })));
  const withinHouse = localEntries.filter(entry => entry.partnerHouse === entry.house).length / 2;
  const acrossHouses = localEntries.filter(entry =>
    entry.partnerHouse !== undefined && entry.partnerHouse !== entry.house).length / 2;
  return {
    elapsedTicks: world.tick(),
    elapsedDays: world.clock().day - 1,
    pupils: students.length,
    professors: professors.length,
    houses: HOUSES.length,
    cohorts: 7,
    subjects: SUBJECTS.length + ELECTIVES.length,
    pupilLessonSlots: students.reduce((n, s) => n + world.attendance(s.id).length, 0),
    teacherLessonSlots: professors.reduce((n, p) => n + world.attendance(p.id).length, 0),
    teachingSessions: scene.sessions.length,
    studyGroups: scene.teachingGroups.length,
    electiveEnrollments: students.filter(s => s.year >= 3)
      .reduce((n, s) => n + s.electives.length, 0),
    attendance: counts,
    studentsWithMissedLessons: active.length,
    firstYearKnowsLumos: students.filter(s =>
      s.year === 1 && world.spellStage(s.id, 'lumos') !== 'unaware').length,
    pupilMeals: students.reduce((n, s) => n + world.mealHistory(s.id).length, 0),
    pupilConversations: students.reduce((n, s) => n + world.conversationHistory(s.id).length, 0),
    withinHouseConversations: withinHouse,
    acrossHouseConversations: acrossHouses,
    pupilRests: students.reduce((n, s) => n + world.restHistory(s.id).length, 0),
    invitations: world.events().filter(e => e.type === 'meeting_offered').length,
    acceptedInvitations: answers.filter(e => e.accepted).length,
    declinedInvitations: answers.filter(e => !e.accepted).length,
    fulfilledMeetings: meetings.filter(m => m.status === 'kept').length,
    missedMeetings: meetings.filter(m => m.status === 'expired').length,
    unansweredInvitations: meetings.filter(m => m.status === 'unanswered').length
  };
}
