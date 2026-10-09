/**
 * [GAME] Named non-pupil residents and subject-owned House Heads in an opt-in
 * experiment fixture. Entities here are presence/sense shells, NOT realistic
 * animal or spirit physics. Preserve the experiment #20 cohort baseline.
 */
import type { EntityId, Simulation } from '../core/Simulation.ts';
import type { createCastleLayout } from './castle-layout.ts';
import type { House, Subject } from './curriculum.ts';

type CastleLayout = ReturnType<typeof createCastleLayout>;
type TeacherSlot = { id: EntityId; subject: Subject };
export type ResidentKind = 'headmaster' | 'caretaker' | 'animal' | 'ghost' | 'poltergeist';
export type CastleResident = {
  id: EntityId; key: string; kind: ResidentKind; home: EntityId;
  house?: House;
};
type StaffIdentity = { subject: Subject; name: string; house?: House };
const STAFF_IDENTITIES: readonly StaffIdentity[] = [
  { subject: 'Transfiguration', name: 'Минерва Макгонагалл', house: 'gryffindor' },
  { subject: 'Charms', name: 'Филиус Флитвик', house: 'ravenclaw' },
  { subject: 'Herbology', name: 'Помона Спраут', house: 'hufflepuff' },
  { subject: 'Potions', name: 'Гораций Слизнорт', house: 'slytherin' },
  { subject: 'History of Magic', name: 'Катберт Биннс' }
];

/** [HYPOTHESIS] School-era continuity of later attested House-Head posts. */
export const NAMED_STAFF: Partial<Record<Subject, string>> =
  Object.fromEntries(STAFF_IDENTITIES.map(({subject,name}) => [subject,name]));

export function createCastleResidents(
  world: Simulation, layout: CastleLayout, professors: readonly TeacherSlot[]
) {
  const teachers = new Map(professors.map(p => [p.subject, p.id]));
  const heads = {} as Record<House, EntityId>;
  for (const staff of STAFF_IDENTITIES) {
    if (staff.house) {
      const id = teachers.get(staff.subject);
      if (id === undefined) throw new Error('Missing House Head teaching slot');
      heads[staff.house] = id;
    }
  }
  const binns = teachers.get('History of Magic');
  if (binns === undefined) throw new Error('Missing ghost History of Magic professor');

  const definitions: readonly {
    key: string; label: string; kind: ResidentKind; roomKey: string; house?: House;
  }[] = [
    { key: 'headmaster_dumbledore', label: 'Альбус Дамблдор', kind: 'headmaster',
      roomKey: 'headmaster_office' },
    { key: 'caretaker_filch', label: 'Аргус Филч', kind: 'caretaker',
      roomKey: 'caretaker_office' },
    { key: 'mrs_norris', label: 'Миссис Норрис', kind: 'animal',
      roomKey: 'caretaker_office' },
    { key: 'ghost_nearly_headless_nick', label: 'Почти Безголовый Ник',
      kind: 'ghost', roomKey: 'gallery_4', house: 'gryffindor' },
    { key: 'ghost_grey_lady', label: 'Серая Дама (Елена Когтевран)',
      kind: 'ghost', roomKey: 'gallery_5', house: 'ravenclaw' },
    { key: 'ghost_fat_friar', label: 'Толстый Монах',
      kind: 'ghost', roomKey: 'gallery_-1', house: 'hufflepuff' },
    { key: 'ghost_bloody_baron', label: 'Кровавый Барон',
      kind: 'ghost', roomKey: 'gallery_-1', house: 'slytherin' },
    { key: 'ghost_moaning_myrtle', label: 'Плакса Миртл',
      kind: 'ghost', roomKey: 'girls_bathroom_2' },
    { key: 'poltergeist_peeves', label: 'Пивз',
      kind: 'poltergeist', roomKey: 'gallery_2' }
  ];
  const people: CastleResident[] = definitions.map(spec => {
    const home = layout.places.get(spec.roomKey)?.id;
    if (home === undefined) throw new Error('Missing resident location: ' + spec.roomKey);
    const id = world.character(spec.key, spec.label, home);
    if(spec.kind==='headmaster')world.grantPointAuthority(id,'headmaster');
    return { id, key: spec.key, kind: spec.kind, home,
      ...(spec.house ? { house: spec.house } : {}) };
  });
  const filch=people.find(x=>x.key==='caretaker_filch')!.id;
  const norris=people.find(x=>x.key==='mrs_norris')!.id;
  const office=layout.caretakerOffice;
  // Shared known corridor network, not remote knowledge of the partner.
  world.configurePatrol(filch,'caretaker',[
    office,layout.landings[0].west,layout.landings[0].gallery,
    layout.landings[1].west,layout.landings[2].gallery,
    layout.landings[0].west,office
  ]);
  world.configurePatrol(norris,'animal',[
    office,layout.landings[0].west,layout.landings[0].gallery,
    layout.landings[2].gallery,layout.landings[0].west,office
  ],filch,office);
  return { heads, ghostProfessor: binns, people };
}
