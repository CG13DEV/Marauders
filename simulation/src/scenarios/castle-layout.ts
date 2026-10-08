/**
 * [GAME] A *subject-owned*, reusable topology fixture.
 * Floored locations retain stable keys and world-level lore provenance.
 * Canonical referents are used conservatively: most wing links are [GAME].
 */
import type { Simulation, EntityId, RoomDescriptor } from '../core/Simulation.ts';
import { SUBJECTS, ELECTIVES, type CoreSubject, type ElectiveSubject, type House } from './curriculum.ts';

export type Floor = -1 | 0 | 1 | 2 | 3 | 4;
export type Wing = 'west' | 'east' | 'central';
export type RoomKind =
  | 'landing' | 'gallery' | 'common_room' | 'bedroom'
  | 'classroom' | 'dining' | 'courtyard' | 'hospital'
  | 'library' | 'staff' | 'kitchen' | 'greenhouse' | 'tower';
export type Place = {
  key: string; id: EntityId; floor: Floor; wing: Wing; kind: RoomKind;
  house?: House;
  loreStatus?: RoomDescriptor['loreStatus'];
  loreSource?: string;
};
export type HouseRooms = { common: EntityId; girls: EntityId; boys: EntityId; floor: Floor };
export type FloorConnections = { west: EntityId; east: EntityId; gallery: EntityId };

const LEXICON = 'https://www.hp-lexicon.org';
const sources = {
  charms: LEXICON + '/place/hogwarts-school-of-witchcraft-and-wizardry/hogwarts-third-floor/charms-classroom/',
  library: LEXICON + '/place/hogwarts-school-of-witchcraft-and-wizardry/hogwarts-fourth-floor/library/',
  potions: LEXICON + '/thing/potions-dungeon/',
  hospital: LEXICON + '/place/hogwarts-school-of-witchcraft-and-wizardry/hogwarts-third-floor/hospital-wing/',
  astronomy: LEXICON + '/place/hogwarts-school-of-witchcraft-and-wizardry/astronomy-tower/'
};

export function createCastleLayout(world: Simulation) {
  const places = new Map<string, Place>();
  function add(key: string, label: string, floor: Floor, wing: Wing,
               kind: RoomKind, options: {
                 house?: House;
                 loreStatus?: RoomDescriptor['loreStatus'];
                 loreSource?: string;
               } = {}): EntityId {
    const id = world.room(key, label, { floor, wing, kind, ...options });
    places.set(key, { id, key, floor, wing, kind, ...options });
    return id;
  }

  const levels = [-1, 0, 1, 2, 3, 4] as const;
  const landings = {} as Record<Floor, FloorConnections>;
  for (const floor of levels) {
    const west = add('west_landing_' + floor, 'Западная лестница: уровень ' + floor, floor, 'west', 'landing');
    const east = add('east_landing_' + floor, 'Восточная лестница: уровень ' + floor, floor, 'east', 'landing');
    const gallery = add('gallery_' + floor, 'Галерея: уровень ' + floor, floor, 'central', 'gallery');
    landings[floor] = { west, east, gallery };
    world.connect(west, gallery);
    world.connect(gallery, east);
    if (floor === 0 || floor === 2 || floor === 4) world.connect(west, east);
  }
  for (let index = 1; index < levels.length; index++) {
    world.connect(landings[levels[index - 1]!]!.west, landings[levels[index]!]!.west);
    world.connect(landings[levels[index - 1]!]!.east, landings[levels[index]!]!.east);
  }

  const hall = landings[0].gallery;
  const greatHall = add('great_hall', 'Большой зал', 0, 'central', 'dining');
  world.connect(hall, greatHall);
  const courtyard = add('courtyard', 'Школьный двор', 0, 'central', 'courtyard');
  world.connect(landings[0].west, courtyard);
  world.connect(landings[0].east, courtyard);

  const hospital = add('hospital_wing', 'Больничное крыло', 1, 'west', 'hospital', {
    loreStatus: 'INFERENCE', loreSource: sources.hospital
  });
  world.connect(landings[1].west, hospital);
  const library = add('library', 'Библиотека', 4, 'east', 'library', {
    loreStatus: 'INFERENCE', loreSource: sources.library
  });
  world.connect(landings[4].east, library);
  const staffRoom = add('staff_room', 'Учительская', 1, 'east', 'staff');
  world.connect(landings[1].east, staffRoom);
  const kitchens = add('kitchens', 'Кухни', -1, 'west', 'kitchen', { loreStatus: 'INFERENCE' });
  world.connect(landings[-1].west, kitchens);

  const dorms = {} as Record<House, HouseRooms>;
  const houseData = [
    { house: 'gryffindor', label: 'Гриффиндор', floor: 4, wing: 'west' },
    { house: 'ravenclaw', label: 'Когтевран', floor: 4, wing: 'east' },
    { house: 'hufflepuff', label: 'Пуффендуй', floor: -1, wing: 'west' },
    { house: 'slytherin', label: 'Слизерин', floor: -1, wing: 'east' }
  ] as const;
  for (const spec of houseData) {
    const common = add('dorm_' + spec.house, 'Гостиная: ' + spec.label,
      spec.floor, spec.wing, 'common_room', { house: spec.house });
    const boys = add('boys_' + spec.house, 'Спальня мальчиков: ' + spec.label,
      spec.floor, spec.wing, 'bedroom', { house: spec.house });
    const girls = add('girls_' + spec.house, 'Спальня девочек: ' + spec.label,
      spec.floor, spec.wing, 'bedroom', { house: spec.house });
    world.connect(landings[spec.floor][spec.wing], common);
    world.connect(common, boys);
    world.connect(common, girls);
    dorms[spec.house] = { common, boys, girls, floor: spec.floor };
  }

  // Each teaching space belongs to a subject, NOT a year group.
  const classrooms = {} as Record<CoreSubject, EntityId>;
  const makeCore = (subject: CoreSubject, key: string, label: string,
                    floor: Floor, wing: Wing,
                    kind: RoomKind = 'classroom',
                    loreStatus: RoomDescriptor['loreStatus'] = 'GAME',
                    loreSource?: string) => {
    const id = add(key, label, floor, wing, kind, {
      loreStatus, ...(loreSource ? { loreSource } : {})
    });
    classrooms[subject] = id;
    return id;
  };

  const charmsCorridor = add('charms_corridor', 'Коридор чар', 3, 'west', 'gallery', {
    loreStatus: 'INFERENCE', loreSource: sources.charms
  });
  world.connect(landings[3].west, charmsCorridor);
  const charms = makeCore('Charms', 'classroom_charms', 'Кабинет чар',
    3, 'west', 'classroom', 'INFERENCE', sources.charms);
  world.connect(charmsCorridor, charms);

  const potions = makeCore('Potions', 'classroom_potions', 'Кабинет зельеварения',
    -1, 'east', 'classroom', 'CANON', sources.potions);
  world.connect(landings[-1].east, potions);
  const astronomy = makeCore('Astronomy', 'astronomy_tower', 'Астрономическая башня',
    4, 'east', 'tower', 'CANON', sources.astronomy);
  world.connect(landings[4].east, astronomy);
  const greenhouse = makeCore('Herbology', 'herbology_greenhouse', 'Оранжерея',
    0, 'west', 'greenhouse', 'CANON');
  world.connect(courtyard, greenhouse);

  const corePlaces: readonly [CoreSubject, string, string, Floor, 'west' | 'east'][] = [
    ['Transfiguration', 'classroom_transfiguration', 'Кабинет трансфигурации', 1, 'east'],
    ['Defense Against the Dark Arts', 'classroom_defense', 'Кабинет ЗОТИ', 2, 'west'],
    ['History of Magic', 'classroom_history', 'Кабинет истории магии', 0, 'east']
  ];
  for (const [subject, key, label, floor, wing] of corePlaces) {
    const room = makeCore(subject, key, label, floor, wing);
    world.connect(landings[floor][wing], room);
  }

  const electiveRooms = {} as Record<ElectiveSubject, EntityId>;
  const electivePlaces: readonly [ElectiveSubject, string, string, Floor, Wing, RoomKind][] = [
    ['Divination', 'classroom_divination', 'Кабинет прорицаний', 4, 'west', 'tower'],
    ['Care of Magical Creatures', 'creatures_grounds', 'Площадка ухода за существами', 0, 'central', 'courtyard'],
    ['Ancient Runes', 'classroom_runes', 'Кабинет древних рун', 2, 'west', 'classroom'],
    ['Arithmancy', 'classroom_arithmancy', 'Кабинет нумерологии', 2, 'east', 'classroom'],
    ['Muggle Studies', 'classroom_muggle_studies', 'Кабинет магловедения', 1, 'east', 'classroom']
  ];
  for (const [subject, key, label, floor, wing, kind] of electivePlaces) {
    const id = add(key, label, floor, wing, kind, { loreStatus: 'GAME' });
    electiveRooms[subject] = id;
    world.connect(subject === 'Care of Magical Creatures'
      ? courtyard : landings[floor][wing === 'central' ? 'gallery' : wing], id);
  }
  if (new Set(Object.values(classrooms)).size !== SUBJECTS.length ||
      new Set(Object.values(electiveRooms)).size !== ELECTIVES.length) {
    throw new Error('Missing dedicated subject classroom');
  }
  return {
    places, landings, hall, greatHall, courtyard, hospital, library, kitchens,
    staffRoom, dorms, classrooms, electiveRooms, charmsCorridor
  };
}
