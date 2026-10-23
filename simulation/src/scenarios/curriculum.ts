/**
 * [GAME] Curriculum and timetable definitions, independent from room topology.
 * SUBJECTS are core-course fixtures, not a definitive 1970s syllabus.
 */
export const SUBJECTS = [
  'Charms', 'Transfiguration', 'Potions', 'Herbology',
  'Defense Against the Dark Arts', 'History of Magic', 'Astronomy'
] as const;
export type CoreSubject = typeof SUBJECTS[number];

export const ELECTIVES = [
  'Divination', 'Care of Magical Creatures', 'Ancient Runes',
  'Arithmancy', 'Muggle Studies'
] as const;
export type ElectiveSubject = typeof ELECTIVES[number];
export type Subject = CoreSubject | ElectiveSubject;

export const SUBJECT_LABELS: Record<Subject, string> = {
  Charms: 'Чары',
  Transfiguration: 'Трансфигурация',
  Potions: 'Зельеварение',
  Herbology: 'Травология',
  'Defense Against the Dark Arts': 'Защита от тёмных искусств',
  'History of Magic': 'История магии',
  Astronomy: 'Астрономия',
  Divination: 'Прорицания',
  'Care of Magical Creatures': 'Уход за магическими существами',
  'Ancient Runes': 'Древние руны',
  Arithmancy: 'Нумерология',
  'Muggle Studies': 'Магловедение'
};

/** [GAME] Explicit prototype curriculum mapping, not an asserted 1970s syllabus.
 * Adding a formula here never changes its casting rules or leaks knowledge
 * to pupils outside the real lesson attendance pipeline.
 */
export const SPELL_TEACHING_UNITS = [
  {year:1, subject:'Charms', spell:'lumos', provenance:'GAME'}
] as const;

export function introductorySpellFor(year:number, subject:Subject) {
  return SPELL_TEACHING_UNITS.find(unit=>unit.year===year && unit.subject===subject);
}

export const HOUSES = [
  'gryffindor', 'ravenclaw', 'hufflepuff', 'slytherin'
] as const;
export type House = typeof HOUSES[number];

export const HOUSE_LABELS: Record<House, string> = {
  gryffindor: 'Гриффиндор',
  ravenclaw: 'Когтевран',
  hufflepuff: 'Пуффендуй',
  slytherin: 'Слизерин'
};

/**
 * An individual two-subject choice from third year onward.
 * Selection is synthetic test-population data, not a claim about canon pupils.
 */
export function electiveChoices(year: number, house: House, index: number): readonly ElectiveSubject[] {
  if (year < 3) return [];
  const first = (year + HOUSES.indexOf(house) + index) % ELECTIVES.length;
  return [ELECTIVES[first]!, ELECTIVES[(first + 2) % ELECTIVES.length]!];
}
