/**
 * [GAME] An extensible, non-canonical topology fixture for the school-week
 * experiment. Floors are metadata; route permission is the graph itself.
 * Rebuildable from stable keys, without a spatial engine or teleportation.
 */
import type { Simulation, EntityId } from '../core/Simulation.ts';

export type Floor = -1 | 0 | 1 | 2 | 3 | 4;
export type Wing = 'west' | 'east' | 'central';
export type RoomKind =
  | 'landing' | 'gallery' | 'common_room' | 'bedroom'
  | 'classroom' | 'dining' | 'courtyard' | 'hospital'
  | 'library' | 'staff';

export type Place = {
  key: string;
  id: EntityId;
  floor: Floor;
  wing: Wing;
  kind: RoomKind;
  house?: string;
};
export type HouseRooms = {
  common: EntityId;
  girls: EntityId;
  boys: EntityId;
  floor: Floor;
};
export type FloorConnections = {
  west: EntityId;
  east: EntityId;
  gallery: EntityId;
};

export function createCastleLayout(world: Simulation) {
  const places = new Map<string, Place>();
  function add(key: string, label: string, floor: Floor, wing: Wing,
               kind: RoomKind, house?: string): EntityId {
    const id = world.room(key, label, {floor,wing,kind,...(house ? {house}: {})});
    places.set(key, { id, key, floor, wing, kind, ...(house ? { house } : {}) });
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
    // A second route through some floors yields genuine alternatives.
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

  const hospital = add('hospital_wing', 'Больничное крыло', 1, 'west', 'hospital');
  world.connect(landings[1].west, hospital);
  const library = add('library', 'Библиотека', 2, 'east', 'library');
  world.connect(landings[2].east, library);
  const staffRoom = add('staff_room', 'Учительская', 1, 'east', 'staff');
  world.connect(landings[1].east, staffRoom);

  const dorms = {} as Record<'gryffindor'|'ravenclaw'|'hufflepuff'|'slytherin', HouseRooms>;
  const houseData = [
    { house: 'gryffindor', label: 'Гриффиндор', floor: 4, wing: 'west' },
    { house: 'ravenclaw', label: 'Когтевран', floor: 4, wing: 'east' },
    { house: 'hufflepuff', label: 'Пуффендуй', floor: -1, wing: 'west' },
    { house: 'slytherin', label: 'Слизерин', floor: -1, wing: 'east' }
  ] as const;
  for (const spec of houseData) {
    const common = add('dorm_' + spec.house, 'Гостиная: ' + spec.label,
      spec.floor, spec.wing, 'common_room', spec.house);
    const boys = add('boys_' + spec.house, 'Спальня мальчиков: ' + spec.label,
      spec.floor, spec.wing, 'bedroom', spec.house);
    const girls = add('girls_' + spec.house, 'Спальня девочек: ' + spec.label,
      spec.floor, spec.wing, 'bedroom', spec.house);
    world.connect(landings[spec.floor][spec.wing], common);
    world.connect(common, boys);
    world.connect(common, girls);
    dorms[spec.house] = { common, boys, girls, floor: spec.floor };
  }

  const classroomLocations = [
    [0, 'west'], [0, 'east'], [1, 'west'], [1, 'east'],
    [2, 'west'], [2, 'east'], [3, 'west']
  ] as const;
  const classrooms: EntityId[] = [];
  for (const [i, loc] of classroomLocations.entries()) {
    const [floor, wing] = loc;
    const id = add('classroom_y' + (i+1), 'Учебный кабинет ' + (i+1) + '-го курса',
      floor, wing, 'classroom');
    world.connect(landings[floor][wing], id);
    classrooms.push(id);
  }

  return {
    places, landings, hall, greatHall, courtyard, hospital, library,
    staffRoom, dorms, classrooms
  };
}
