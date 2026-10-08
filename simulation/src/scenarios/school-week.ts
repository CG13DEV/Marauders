/**
 * [GAME] Population-and-curriculum vertical slice: all seven year cohorts and
 * four houses share a single deterministic five-day teaching timetable.
 * The tiny castle is a graph; this does not claim a canonical school census.
 */
import { createSimulation } from '../core/Simulation.ts';
import type { Lesson } from '../core/school-time.ts';

export const HOUSES = ['gryffindor', 'ravenclaw', 'hufflepuff', 'slytherin'] as const;
export const SUBJECTS = [
  'Charms', 'Transfiguration', 'Potions', 'Herbology',
  'Defense Against the Dark Arts', 'History of Magic', 'Astronomy'
] as const;
export const SCHOOL_WEEK_DAYS = 5;
export const CLASS_STARTS = [9 * 60, 11 * 60, 14 * 60] as const;
export const PUPILS_PER_HOUSE_PER_YEAR = 3;

type Student = {
  id: number;
  key: string;
  house: typeof HOUSES[number];
  year: number;
};
type Teacher = { id: number; subject: typeof SUBJECTS[number] };

const readableHouse: Record<typeof HOUSES[number], string> = {
  gryffindor: 'Гриффиндор', ravenclaw: 'Когтевран',
  hufflepuff: 'Пуффендуй', slytherin: 'Слизерин'
};
const readableSubject: Record<typeof SUBJECTS[number], string> = {
  Charms: 'Чары', Transfiguration: 'Трансфигурация',
  Potions: 'Зельеварение', Herbology: 'Травология',
  'Defense Against the Dark Arts': 'Защита от тёмных искусств',
  'History of Magic': 'История магии', Astronomy: 'Астрономия'
};

export function createSchoolWeek(world = createSimulation()) {
  const hall = world.room('hall', 'Центральный коридор');
  const staffRoom = world.room('staff_room', 'Учительская');
  world.connect(hall, staffRoom);
  const greatHall = world.room('great_hall', 'Большой зал');
  world.connect(hall, greatHall);

  const dorms = Object.fromEntries(HOUSES.map(house => {
    const room = world.room('dorm_' + house, 'Гостиная факультета ' + readableHouse[house]);
    world.connect(hall, room);
    return [house, room];
  })) as Record<typeof HOUSES[number], number>;

  const classrooms: number[] = [];
  for (let year = 1; year <= 7; year++) {
    const room = world.room('classroom_y' + year, 'Учебный кабинет ' + year + '-го курса');
    world.connect(hall, room);
    classrooms.push(room);
  }

  const professors: Teacher[] = SUBJECTS.map((subject, index) => {
    const id = world.character('prof_' + index, 'Преподаватель: ' + readableSubject[subject], staffRoom);
    world.setDailyLife(id, {
      homeRoom: staffRoom, diningRoom: greatHall,
      style: index % 2 === 0 ? 'outgoing' : 'reserved',
      interest: 'lessons'
    });
    return { id, subject };
  });

  const students: Student[] = [];
  for (let year = 1; year <= 7; year++) {
    for (const house of HOUSES) {
      for (let index = 0; index < PUPILS_PER_HOUSE_PER_YEAR; index++) {
        const key = 'student_y' + year + '_' + house + '_' + (index + 1);
        const id = world.character(key,
          readableHouse[house] + ', ' + year + ' курс, ученик ' + (index + 1), dorms[house]);
        students.push({ id, key, house, year });
        world.setDailyLife(id, {
          homeRoom: dorms[house], diningRoom: greatHall,
          style: index === 2 ? 'reserved' : 'outgoing',
          interest: (['lessons', 'castle', 'hobbies'] as const)[index]!
        });
      }
    }
  }

  const pupilSchedule = new Map<number, Lesson[]>();
  const staffSchedule = new Map<number, Lesson[]>();
  for (const student of students) pupilSchedule.set(student.id, []);
  for (const teacher of professors) staffSchedule.set(teacher.id, []);

  for (let day = 0; day < SCHOOL_WEEK_DAYS; day++) {
    for (let slot = 0; slot < CLASS_STARTS.length; slot++) {
      // Latin-square assignment: seven teachers never teach two classes at once.
      for (let year = 1; year <= 7; year++) {
        const subjectIndex = (year - 1 + day + slot) % SUBJECTS.length;
        const subject = SUBJECTS[subjectIndex]!;
        const professor = professors[subjectIndex]!;
        const room = classrooms[year - 1]!;
        const startsAt = day * 1440 + CLASS_STARTS[slot]!;
        const endsAt = startsAt + 50;
        const lesson: Lesson = {
          id: 'd' + day + '_slot' + slot + '_y' + year,
          subject: readableSubject[subject], room, startsAt, endsAt,
          ...(day === 0 && slot === 0 && year === 1 ? { spell: 'lumos' as const } : {})
        };
        for (const student of students) {
          if (student.year === year) pupilSchedule.get(student.id)!.push(lesson);
        }
        staffSchedule.get(professor.id)!.push(lesson);
      }
    }
  }
  for (const [id, lessons] of pupilSchedule) world.setTimetable(id, lessons, 'lesson_first');
  for (const [id, lessons] of staffSchedule) world.setTimetable(id, lessons, 'lesson_first');
  return {
    world, hall, staffRoom, greatHall, dorms, classrooms,
    professors, students, pupilSchedule, staffSchedule
  };
}

export function reportSchoolWeek(scene: ReturnType<typeof createSchoolWeek>) {
  const { world, students, professors } = scene;
  const counts = { on_time: 0, late: 0, missed: 0, pending: 0 };
  for (const student of students) {
    for (const record of world.attendance(student.id)) counts[record.status]++;
  }
  const active = students.filter(s => world.learningDebt(s.id) > 0);
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
    attendance: counts,
    studentsWithMissedLessons: active.length,
    firstYearKnowsLumos: students.filter(s =>
      s.year === 1 && world.spellStage(s.id, 'lumos') !== 'unaware').length,
    pupilMeals: students.reduce((n, s) => n + world.mealHistory(s.id).length, 0),
    pupilConversations: students.reduce((n, s) => n + world.conversationHistory(s.id).length, 0),
    pupilRests: students.reduce((n, s) => n + world.restHistory(s.id).length, 0)
  };
}
