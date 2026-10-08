import {
  addComponent,
  addEntity,
  createRelation,
  createWorld,
  entityExists,
  getRelationTargets,
  hasComponent,
  removeComponent,
  query
} from 'bitecs';
import { validateMovement, type MoveRejection } from './movement-rules.ts';
import { perceiveCrash } from './perception-rules.ts';
import { createBeliefStore, copyClaim, type Claim, type Belief } from './beliefs.ts';
import { assessReports, decideInvestigation, type Assessment, type Trust } from './cognition.ts';

export type EntityId = number;

export type Command =
  | { type: 'move'; actor: EntityId; destination: EntityId }
  | { type: 'break_object'; actor: EntityId; target: EntityId }
  | { type: 'open_door'; actor: EntityId; door: EntityId }
  | { type: 'tell'; actor: EntityId; listener: EntityId; claim: Claim }
  | { type: 'inspect_object'; actor: EntityId; target: EntityId };

export type WorldEvent =
  | { type: 'entity_moved'; actor: EntityId; from: EntityId; to: EntityId }
  | { type: 'object_broken'; actor: EntityId; target: EntityId; room: EntityId }
  | { type: 'door_opened'; actor: EntityId; door: EntityId }
  | { type: 'testimony_delivered'; actor: EntityId; listener: EntityId; claim: Claim }
  | { type: 'object_inspected'; actor: EntityId; target: EntityId; broken: boolean };

/**
 * What a character is ALLOWED to know.
 *
 * Hearing a crash does NOT carry actor / target IDs or an authoritative event
 * reference. A semantic agent must receive observations(), never events().
 */
export type Observation =
  | { kind: 'witnessed_breakage'; source: 'vision'; actor: EntityId; target: EntityId }
  | { kind: 'heard_crash'; source: 'hearing' }
  | { kind: 'inspected_object'; source: 'vision'; target: EntityId; broken: boolean };

export type BreakRejection =
  | 'unknown_actor'
  | 'not_character'
  | 'unknown_target'
  | 'not_breakable'
  | 'already_broken'
  | 'not_in_reach';

export type SocialRejection = 'unknown_listener' | 'listener_not_character' | 'cannot_talk_to_self' | 'not_colocated' | 'listener_cannot_hear' | 'invalid_claim';
export type DoorRejection = 'unknown_door' | 'not_door' | 'not_near_door' | 'already_open';
export type InspectRejection = 'cannot_see' | 'not_inspectable' | 'not_in_reach';

export type CommandResult =
  | { ok: true; events: readonly WorldEvent[] }
  | { ok: false; reason: MoveRejection | BreakRejection | SocialRejection | DoorRejection | InspectRejection; events: readonly [] };

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
  const Inquisitive = {};
  const Trusts = createRelation();
  const Distrusts = createRelation();
  const Name = { value: [] as string[] };
  const LocatedIn = createRelation({ exclusive: true });
  const PassageTo = createRelation();

  const keys = new Map<string, EntityId>();
  const doors = new Map<string, EntityId>();
  const events: WorldEvent[] = [];
  const observationsByCharacter = new Map<EntityId, Observation[]>();
  const beliefsByCharacter = createBeliefStore();

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
    beliefsByCharacter.register(eid);
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

  function copyEvent(event: WorldEvent): WorldEvent {
    return event.type === 'testimony_delivered'
      ? { ...event, claim: copyClaim(event.claim) }
      : { ...event };
  }

  function isCharacter(eid: EntityId): boolean {
    return entityExists(ecs, eid) && hasComponent(ecs, eid, Character);
  }

  function setTrust(observer: EntityId, source: EntityId, value: Trust): void {
    if (!isCharacter(observer) || !isCharacter(source) || observer === source) {
      throw new Error('Trust requires two different characters');
    }
    if (value !== 'trusted' && value !== 'neutral' && value !== 'distrusted') {
      throw new Error('Unknown trust level');
    }
    removeComponent(ecs, observer, Trusts(source));
    removeComponent(ecs, observer, Distrusts(source));
    if (value === 'trusted') addComponent(ecs, observer, Trusts(source));
    if (value === 'distrusted') addComponent(ecs, observer, Distrusts(source));
  }

  function trustOf(observer: EntityId, source: EntityId): Trust {
    if (!isCharacter(observer) || !isCharacter(source)) return 'neutral';
    if (hasComponent(ecs, observer, Trusts(source))) return 'trusted';
    if (hasComponent(ecs, observer, Distrusts(source))) return 'distrusted';
    return 'neutral';
  }

  function setInquisitive(character: EntityId, enabled: boolean): void {
    if (!isCharacter(character)) throw new Error('Inquisitiveness requires a character');
    if (enabled) addComponent(ecs, character, Inquisitive);
    else removeComponent(ecs, character, Inquisitive);
  }

  function assessment(observer: EntityId, object: EntityId): Assessment {
    if (!isCharacter(observer)) throw new Error('Assessment requires a character');
    return assessReports(object, beliefsByCharacter.read(observer),
      speaker => trustOf(observer, speaker));
  }

  function emit(event: WorldEvent): void {
    events.push(copyEvent(event));
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
        beliefsByCharacter.remember(observer,
          { kind: 'broke_object', culprit: event.actor, object: event.target },
          { kind: 'vision', eventSequence: events.length }
        );
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
    if (command.type === 'open_door') {
      if (!entityExists(ecs, command.door)) {
        return { ok: false, reason: 'unknown_door', events: [] };
      }
      if (!hasComponent(ecs, command.door, Door)) {
        return { ok: false, reason: 'not_door', events: [] };
      }
      const place = currentRoom(command.actor);
      if (place !== Door.roomA[command.door] && place !== Door.roomB[command.door]) {
        return { ok: false, reason: 'not_near_door', events: [] };
      }
      if (Door.open[command.door] === 1) {
        return { ok: false, reason: 'already_open', events: [] };
      }
      Door.open[command.door] = 1;
      const event: WorldEvent = { type: 'door_opened', actor: command.actor, door: command.door };
      emit(event);
      return { ok: true, events: [copyEvent(event)] };
    }

    if (command.type === 'tell') {
      if (!entityExists(ecs, command.listener)) {
        return { ok: false, reason: 'unknown_listener', events: [] };
      }
      if (!hasComponent(ecs, command.listener, Character)) {
        return { ok: false, reason: 'listener_not_character', events: [] };
      }
      if (command.actor === command.listener) {
        return { ok: false, reason: 'cannot_talk_to_self', events: [] };
      }
      if (currentRoom(command.actor) === null || currentRoom(command.actor) !== currentRoom(command.listener)) {
        return { ok: false, reason: 'not_colocated', events: [] };
      }
      if (!hasComponent(ecs, command.listener, Hearing)) {
        return { ok: false, reason: 'listener_cannot_hear', events: [] };
      }
      // A claim may be false, but its referents must exist and be of the right types.
      if (command.claim.kind !== 'broke_object' ||
          !entityExists(ecs, command.claim.culprit) ||
          !hasComponent(ecs, command.claim.culprit, Character) ||
          !entityExists(ecs, command.claim.object) ||
          !hasComponent(ecs, command.claim.object, Fragile)) {
        return { ok: false, reason: 'invalid_claim', events: [] };
      }
      const event: WorldEvent = {
        type: 'testimony_delivered', actor: command.actor,
        listener: command.listener, claim: copyClaim(command.claim)
      };
      emit(event);
      beliefsByCharacter.remember(command.listener, command.claim,
        { kind: 'testimony', speaker: command.actor, eventSequence: events.length }
      );
      return { ok: true, events: [copyEvent(event)] };
    }

    if (command.type === 'inspect_object') {
      if (!entityExists(ecs, command.target)) {
        return { ok: false, reason: 'unknown_target', events: [] };
      }
      if (!hasComponent(ecs, command.target, Fragile)) {
        return { ok: false, reason: 'not_inspectable', events: [] };
      }
      if (!hasComponent(ecs, command.actor, Vision)) {
        return { ok: false, reason: 'cannot_see', events: [] };
      }
      const room = currentRoom(command.actor);
      if (room === null || locationOf(command.target) !== room) {
        return { ok: false, reason: 'not_in_reach', events: [] };
      }
      const broken = Fragile.broken[command.target] === 1;
      const event: WorldEvent = { type: 'object_inspected', actor: command.actor, target: command.target, broken };
      emit(event);
      observationsByCharacter.get(command.actor)!.push({
        kind: 'inspected_object', source: 'vision', target: command.target, broken
      });
      return { ok: true, events: [copyEvent(event)] };
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

  function step(): { actor: EntityId; action: Command; result: CommandResult }[] {
    // The decision policy reads only the actor's beliefs and locally visible
    // objects. In particular it never reads authoritative broken-state or events.
    const decisions: { actor: EntityId; action: Command; result: CommandResult }[] = [];
    for (const actor of query(ecs, [Character, Inquisitive])) {
      if (!hasComponent(ecs, actor, Vision)) continue;
      const room = currentRoom(actor);
      if (room === null) continue;
      const visibleObjects = Array.from(query(ecs, [Fragile, LocatedIn(room)]));
      const beliefs = beliefsByCharacter.read(actor);
      const claimedObjects = [...new Set(beliefs.map(b => b.claim.object))];
      const inspected = new Set(observations(actor)
        .filter(o => o.kind === 'inspected_object')
        .map(o => o.target));
      const assessments = claimedObjects.map(object => assessment(actor, object));
      const target = decideInvestigation(assessments, visibleObjects, inspected, true);
      if (target === null) continue;
      const action: Command = { type: 'inspect_object', actor, target };
      const result = execute(action);
      decisions.push({ actor, action, result });
    }
    return decisions;
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
    room, character, fragileObject, connect, execute, step,
    setTrust, trustOf, setInquisitive, assessment,
    beliefs: (observer: EntityId): Belief[] => beliefsByCharacter.read(observer),
    currentRoom, locationOf, occupants, observations,
    isBroken: (eid: EntityId) => hasComponent(ecs, eid, Fragile) && Fragile.broken[eid] === 1,
    doorIsOpen: (eid: EntityId) => hasComponent(ecs, eid, Door) ? Door.open[eid] === 1 : null,
    id: (key: string) => keys.get(key),
    label: (eid: EntityId) => Name.value[eid] ?? `entity#${eid}`,
    exits: (place: EntityId) => getRelationTargets(ecs, place, PassageTo),
    events: () => events.map(copyEvent)
  };
}

export type Simulation = ReturnType<typeof createSimulation>;
