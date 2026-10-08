import {
  addComponent,
  addEntity,
  createRelation,
  createWorld,
  entityExists,
  getRelationTargets,
  hasComponent,
  query
} from 'bitecs';
import { validateMovement, type MoveRejection } from './movement-rules.ts';
import { perceiveCrash } from './perception-rules.ts';

export type EntityId = number;

export type Command =
  | { type: 'move'; actor: EntityId; destination: EntityId }
  | { type: 'break_object'; actor: EntityId; target: EntityId };

export type WorldEvent =
  | { type: 'entity_moved'; actor: EntityId; from: EntityId; to: EntityId }
  | { type: 'object_broken'; actor: EntityId; target: EntityId; room: EntityId };

/**
 * What a character is ALLOWED to know.
 *
 * Hearing a crash does NOT carry actor / target IDs or an authoritative event
 * reference. A semantic agent must receive observations(), never events().
 */
export type Observation =
  | { kind: 'witnessed_breakage'; source: 'vision'; actor: EntityId; target: EntityId }
  | { kind: 'heard_crash'; source: 'hearing' };

export type BreakRejection =
  | 'unknown_actor'
  | 'not_character'
  | 'unknown_target'
  | 'not_breakable'
  | 'already_broken'
  | 'not_in_reach';

export type CommandResult =
  | { ok: true; events: readonly WorldEvent[] }
  | { ok: false; reason: MoveRejection | BreakRejection; events: readonly [] };

export type DoorOptions = {
  door: { key: string; label: string; open: boolean };
};

function pairKey(a: EntityId, b: EntityId): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * One Simulation = one ECS world, component stores, door registry, event log,
 * and character-local observation ledger. No module-level mutable state.
 */
export function createSimulation() {
  const ecs = createWorld();
  const Room = {};
  const Character = {};
  const Fragile = { broken: [] as number[] };
  const Door = { roomA: [] as EntityId[], roomB: [] as EntityId[], open: [] as number[] };
  const Vision = {};
  const Hearing = {};
  const Name = { value: [] as string[] };
  const LocatedIn = createRelation({ exclusive: true });
  const PassageTo = createRelation();

  const keys = new Map<string, EntityId>();
  const doors = new Map<string, EntityId>();
  const events: WorldEvent[] = [];
  const observationsByCharacter = new Map<EntityId, Observation[]>();

  function addNamedEntity(key: string, label: string): EntityId {
    if (keys.has(key)) throw new Error(`Duplicate entity key: ${key}`);
    const eid = addEntity(ecs);
    addComponent(ecs, eid, Name);
    Name.value[eid] = label;
    keys.set(key, eid);
    return eid;
  }

  function isRoom(eid: EntityId): boolean {
    return entityExists(ecs, eid) && hasComponent(ecs, eid, Room);
  }

  function room(key: string, label: string): EntityId {
    const eid = addNamedEntity(key, label);
    addComponent(ecs, eid, Room);
    return eid;
  }

  function character(
    key: string,
    label: string,
    initialRoom: EntityId,
    senses: { vision?: boolean; hearing?: boolean } = {}
  ): EntityId {
    if (!isRoom(initialRoom)) throw new Error(`Invalid starting room: ${initialRoom}`);
    const eid = addNamedEntity(key, label);
    addComponent(ecs, eid, Character);
    if (senses.vision !== false) addComponent(ecs, eid, Vision);
    if (senses.hearing !== false) addComponent(ecs, eid, Hearing);
    addComponent(ecs, eid, LocatedIn(initialRoom));
    observationsByCharacter.set(eid, []);
    return eid;
  }

  function fragileObject(key: string, label: string, initialRoom: EntityId): EntityId {
    if (!isRoom(initialRoom)) throw new Error(`Invalid starting room: ${initialRoom}`);
    const eid = addNamedEntity(key, label);
    addComponent(ecs, eid, Fragile);
    Fragile.broken[eid] = 0;
    addComponent(ecs, eid, LocatedIn(initialRoom));
    return eid;
  }

  function connect(a: EntityId, b: EntityId, options?: DoorOptions): EntityId | undefined {
    if (!isRoom(a) || !isRoom(b) || a === b) {
      throw new Error('Passages must connect two distinct rooms');
    }
    const key = pairKey(a, b);
    if (doors.has(key)) throw new Error('This passage already has a door');
    if (options?.door && hasComponent(ecs, a, PassageTo(b))) {
      throw new Error('Cannot add a door to an existing passage');
    }
    addComponent(ecs, a, PassageTo(b));
    addComponent(ecs, b, PassageTo(a));
    if (!options?.door) return undefined;

    const doorId = addNamedEntity(options.door.key, options.door.label);
    addComponent(ecs, doorId, Door);
    Door.roomA[doorId] = a;
    Door.roomB[doorId] = b;
    Door.open[doorId] = options.door.open ? 1 : 0;
    doors.set(key, doorId);
    return doorId;
  }

  function locationOf(entity: EntityId): EntityId | null {
    if (!entityExists(ecs, entity)) return null;
    return getRelationTargets(ecs, entity, LocatedIn)[0] ?? null;
  }

  function currentRoom(actor: EntityId): EntityId | null {
    return hasComponent(ecs, actor, Character) ? locationOf(actor) : null;
  }

  function adjacent(a: EntityId, b: EntityId): boolean {
    return isRoom(a) && isRoom(b) && hasComponent(ecs, a, PassageTo(b));
  }

  function passageOpen(a: EntityId, b: EntityId): boolean {
    if (!adjacent(a, b)) return false;
    const door = doors.get(pairKey(a, b));
    return door === undefined || Door.open[door] === 1;
  }

  function emit(event: WorldEvent): void {
    events.push(event);
    if (event.type !== 'object_broken') return;

    // An authoritative event becomes *different* observations per observer.
    for (const observer of query(ecs, [Character])) {
      const location = currentRoom(observer);
      if (location === null) continue;
      const sameRoom = location === event.room;
      const adjacentRoom = adjacent(location, event.room);
      const mode = perceiveCrash({
        sameRoom, adjacentRoom,
        openView: adjacentRoom && passageOpen(location, event.room),
        vision: hasComponent(ecs, observer, Vision),
        hearing: hasComponent(ecs, observer, Hearing)
      });

      const ledger = observationsByCharacter.get(observer);
      if (!ledger) throw new Error('Character missing observation ledger');
      if (mode === 'witnessed') {
        ledger.push({ kind: 'witnessed_breakage', source: 'vision', actor: event.actor, target: event.target });
      } else if (mode === 'heard') {
        ledger.push({ kind: 'heard_crash', source: 'hearing' });
      }
    }
  }

  function execute(command: Command): CommandResult {
    if (command.type === 'move') {
      const from = currentRoom(command.actor);
      const isConnected = from !== null && adjacent(from, command.destination);
      const reason = validateMovement({
        actorExists: entityExists(ecs, command.actor),
        isCharacter: hasComponent(ecs, command.actor, Character),
        destinationExists: entityExists(ecs, command.destination),
        destinationIsRoom: isRoom(command.destination),
        currentRoom: from,
        destination: command.destination,
        hasPassage: isConnected,
        passageOpen: isConnected && from !== null && passageOpen(from, command.destination)
      });
      if (reason !== null) return { ok: false, reason, events: [] };

      addComponent(ecs, command.actor, LocatedIn(command.destination));
      const event: WorldEvent = { type: 'entity_moved', actor: command.actor, from: from!, to: command.destination };
      emit(event);
      return { ok: true, events: [event] };
    }

    if (!entityExists(ecs, command.actor)) {
      return { ok: false, reason: 'unknown_actor', events: [] };
    }
    if (!hasComponent(ecs, command.actor, Character)) {
      return { ok: false, reason: 'not_character', events: [] };
    }
    if (!entityExists(ecs, command.target)) {
      return { ok: false, reason: 'unknown_target', events: [] };
    }
    if (!hasComponent(ecs, command.target, Fragile)) {
      return { ok: false, reason: 'not_breakable', events: [] };
    }
    if (Fragile.broken[command.target] === 1) {
      return { ok: false, reason: 'already_broken', events: [] };
    }
    const actorRoom = currentRoom(command.actor);
    if (actorRoom === null || actorRoom !== locationOf(command.target)) {
      return { ok: false, reason: 'not_in_reach', events: [] };
    }

    Fragile.broken[command.target] = 1;
    const event: WorldEvent = { type: 'object_broken', actor: command.actor, target: command.target, room: actorRoom };
    emit(event);
    return { ok: true, events: [event] };
  }

  function occupants(place: EntityId): EntityId[] {
    if (!isRoom(place)) return [];
    return Array.from(query(ecs, [Character, LocatedIn(place)]));
  }

  function observations(observer: EntityId): Observation[] {
    const ledger = observationsByCharacter.get(observer);
    return ledger ? ledger.map(record => ({ ...record })) : [];
  }

  return {
    room, character, fragileObject, connect, execute,
    currentRoom, locationOf, occupants, observations,
    isBroken: (eid: EntityId) => hasComponent(ecs, eid, Fragile) && Fragile.broken[eid] === 1,
    doorIsOpen: (eid: EntityId) => hasComponent(ecs, eid, Door) ? Door.open[eid] === 1 : null,
    id: (key: string) => keys.get(key),
    label: (eid: EntityId) => Name.value[eid] ?? `entity#${eid}`,
    exits: (place: EntityId) => getRelationTargets(ecs, place, PassageTo),
    events: () => events.map(event => ({ ...event }))
  };
}

export type Simulation = ReturnType<typeof createSimulation>;
