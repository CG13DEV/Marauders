/**
 * [GAME] One academic week with reusable subject rooms, teacher-owned sessions,
 * cross-house learning groups and individual upper-year elective choices.
 * Scheduling rules deliberately do NOT live in ECS or castle topology.
 */
import { createSimulation } from '../core/Simulation.ts';
import type { Lesson } from '../core/school-time.ts';
import { createCastleLayout } from './castle-layout.ts';
import {
  HOUSES, SUBJECTS, ELECTIVES, HOUSE_LABELS, SUBJECT_LABELS, electiveChoices,
  type House, type CoreSubject, type ElectiveSubject, type Subject
} from './curriculum.ts';

export { HOUSES, SUBJECTS, ELECTIVES } from './curriculum.ts';
export const SCHOOL_WEEK_DAYS = 5;
export const CLASS_STARTS = [9 * 60, 11 * 60, 14 * 60] as const;
export const PUPILS_PER_HOUSE_PER_YEAR = 3;

export type Student = {
  id: number;
  key: string;
  house: House;
  year: number;
  dormGroup: 'girls' | 'boys';
  groupId: string;
  electives: readonly ElectiveSubject[];
};
export type Teacher = { id: number; subject: Subject };
export type TeachingGroup = {
  id: string;
  year: number;
  houses: readonly [House, House];
  students: number[];
};
export type TeachingSession = {
  id: string;
  subject: Subject;
  teacher: number;
  room: number;
  startsAt: number;
  endsAt: number;
  groupId: string;
  students: readonly number[];
};

export function createSchoolWeek(world = createSimulation()) {
  const layout = createCastleLayout(world);
  const { hall, greatHall, staffRoom, library, courtyard, hospital,
    classrooms, electiveRooms } = layout;
  const dorms = Object.fromEntries(HOUSES.map(house =>
    [house, layout.dorms[house].common])) as Record<House, number>;

  const professors: Teacher[] = [...SUBJECTS, ...ELECTIVES].map((subject, index) => {
    const id = world.character('prof_' + index,
      'Преподаватель: ' + SUBJECT_LABELS[subject], staffRoom);
    world.setDailyLife(id, {
      homeRoom: staffRoom, diningRoom: greatHall,
      style: index % 2 === 0 ? 'outgoing' : 'reserved',
      interest: 'lessons'
    });
    return { id, subject };
  });
  const teachersBySubject = new Map(professors.map(p => [p.subject, p.id]));

  // Cross-house teaching groups share a year and a subject curriculum.
  // Group assignments are [GAME], not an assertion of canonical pairings.
  const teachingGroups: TeachingGroup[] = [];
  for (let year = 1; year <= 7; year++) {
    for (let pair = 0; pair < 2; pair++) {
      const houses = [HOUSES[pair * 2]!, HOUSES[pair * 2 + 1]!] as const;
      teachingGroups.push({
        id: 'y' + year + '_pair' + pair, year, houses, students: []
      });
    }
  }

  const students: Student[] = [];
  for (let year = 1; year <= 7; year++) {
    for (const house of HOUSES) {
      for (let index = 0; index < PUPILS_PER_HOUSE_PER_YEAR; index++) {
        const key = 'student_y' + year + '_' + house + '_' + (index + 1);
        // Synthetic test population: these slots are not facts about named pupils.
        const dormGroup = (year + index) % 2 === 0 ? 'girls' : 'boys';
        const sleepingRoom = layout.dorms[house][dormGroup];
        const id = world.character(key,
          HOUSE_LABELS[house] + ', ' + year + ' курс, ученик ' + (index + 1),
          sleepingRoom);
        const pair = Math.floor(HOUSES.indexOf(house) / 2);
        const group = teachingGroups[(year - 1) * 2 + pair]!;
        const electives = electiveChoices(year, house, index);
        students.push({ id, key, house, year, dormGroup, groupId: group.id, electives });
        group.students.push(id);
        world.setDailyLife(id, {
          homeRoom: sleepingRoom, socialRoom: dorms[house],
          diningRoom: greatHall,
          leisureRoom: index === 0 ? library : index === 1 ? courtyard : dorms[house],
          style: index === 2 ? 'reserved' : 'outgoing',
          interest: (['lessons', 'castle', 'hobbies'] as const)[index]!
        });
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
    const lesson: Lesson = {
      id, subject: SUBJECT_LABELS[subject], room,
      startsAt, endsAt, groupId, teacher,
      ...(subject === 'Charms' && groupYear === 1 ? { spell: 'lumos' as const } : {})
    };
    staffSchedule.get(teacher)!.push(lesson);
    for (const student of students) pupilSchedule.get(student)!.push(lesson);
  }

  // 7 core professors × 15 weekly periods = 105 unique teaching sessions.
  // Alternating the two group tracks avoids teacher conflicts; each group
  // meets a rotating subject rather than always following the same professor.
  for (let day = 0; day < SCHOOL_WEEK_DAYS; day++) {
    for (let slot = 0; slot < CLASS_STARTS.length; slot++) {
      const periodIndex = day * CLASS_STARTS.length + slot;
      const track = periodIndex % 2;
      const rotation = Math.floor(periodIndex / 2);
      const startsAt = day * 1440 + CLASS_STARTS[slot]!;
      for (let subjectIndex = 0; subjectIndex < SUBJECTS.length; subjectIndex++) {
        const subject = SUBJECTS[subjectIndex]!;
        const groupIndex = track * 7 + (subjectIndex + rotation) % 7;
        const group = teachingGroups[groupIndex]!;
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

  // Keep student and teacher timetables chronological for reproducible queries.
  for (const [id, lessons] of pupilSchedule) {
    lessons.sort((a, b) => a.startsAt - b.startsAt);
    world.setTimetable(id, lessons, 'lesson_first');
  }
  for (const [id, lessons] of staffSchedule) {
    lessons.sort((a, b) => a.startsAt - b.startsAt);
    world.setTimetable(id, lessons, 'lesson_first');
  }

  return {
    world, layout, hall, staffRoom, greatHall, library, courtyard, hospital,
    dorms, classrooms, electiveRooms, professors, students, teachingGroups,
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
    subjects: SUBJECTS.length,
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
    pupilRests: students.reduce((n, s) => n + world.restHistory(s.id).length, 0)
  };
}
