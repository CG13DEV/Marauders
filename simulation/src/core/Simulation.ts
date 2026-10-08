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
import { nextRoomOnRoute } from './navigation.ts';

export type EntityId = number;

export type Command =
  | { type: 'move'; actor: EntityId; destination: EntityId }
  | { type: 'break_object'; actor: EntityId; target: EntityId }
  | { type: 'open_door'; actor: EntityId; door: EntityId }
  | { type: 'tell'; actor: EntityId; listener: EntityId; claim: Claim }
  | { type: 'inspect_object'; actor: EntityId; target: EntityId }
  | { type: 'ask_about'; actor: EntityId; listener: EntityId; object: EntityId };

export type WorldEvent =
  | { type: 'entity_moved'; actor: EntityId; from: EntityId; to: EntityId }
  | { type: 'object_broken'; actor: EntityId; target: EntityId; room: EntityId }
  | { type: 'door_opened'; actor: EntityId; door: EntityId }
  | { type: 'testimony_delivered'; actor: EntityId; listener: EntityId; claim: Claim }
  | { type: 'object_inspected'; actor: EntityId; target: EntityId; broken: boolean }
  | { type: 'question_asked'; actor: EntityId; listener: EntityId; object: EntityId; answered: boolean };

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
export type QuestionRejection = 'listener_cannot_hear' | 'not_known' | 'cannot_hear' | 'not_colocated' | 'not_inspectable' | 'unknown_listener' | 'listener_not_character' | 'cannot_talk_to_self' | 'unknown_target';

export type CommandResult =
  | { ok: true; events: readonly WorldEvent[] }
  | { ok: false; reason: MoveRejection | BreakRejection | SocialRejection | DoorRejection | InspectRejection | QuestionRejection; events: readonly [] };

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
  const SociableInvestigator = {};
  const Guarded = {};
  const HasRoutine = {};
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
  // Goals remember what has been attempted, not secret NPC locations.
  type Search = {
    object: EntityId;
    asked: Set<EntityId>;
    seenRooms: Set<EntityId>;
    trail: EntityId[];
  };
  const searches = new Map<EntityId, Search>();
  const routines = new Map<EntityId, EntityId[]>();
  let tick = 0;

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

  function setSocialInvestigator(actor: EntityId, enabled: boolean): void {
    if (!isCharacter(actor)) throw new Error('Social investigation requires a character');
    if (enabled) addComponent(ecs, actor, SociableInvestigator);
    else {
      removeComponent(ecs, actor, SociableInvestigator);
      searches.delete(actor);
    }
  }

  function setGuarded(character: EntityId, enabled: boolean): void {
    if (!isCharacter(character)) throw new Error('Guarded disposition requires a character');
    if (enabled) addComponent(ecs, character, Guarded);
    else removeComponent(ecs, character, Guarded);
  }

  function setRoutine(actor: EntityId, destinations: readonly EntityId[]): void {
    if (!isCharacter(actor)) throw new Error('Routine requires a character');
    if (destinations.some(destination => !isRoom(destination))) {
      throw new Error('Routine destinations must all be rooms');
    }
    if (destinations.length > 0) {
      routines.set(actor, [...destinations]);
      addComponent(ecs, actor, HasRoutine);
    } else {
      routines.delete(actor);
      removeComponent(ecs, actor, HasRoutine);
    }
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

    if (command.type === 'ask_about') {
      if (!entityExists(ecs, command.listener)) return { ok: false, reason: 'unknown_listener', events: [] };
      if (!isCharacter(command.listener)) return { ok: false, reason: 'listener_not_character', events: [] };
      if (command.actor === command.listener) return { ok: false, reason: 'cannot_talk_to_self', events: [] };
      if (!entityExists(ecs, command.object)) return { ok: false, reason: 'unknown_target', events: [] };
      if (!hasComponent(ecs, command.object, Fragile)) return { ok: false, reason: 'not_inspectable', events: [] };
      if (!beliefsByCharacter.read(command.actor).some(b => b.claim.object === command.object)) {
        return { ok: false, reason: 'not_known', events: [] };
      }
      if (currentRoom(command.actor) === null || currentRoom(command.actor) !== currentRoom(command.listener)) {
        return { ok: false, reason: 'not_colocated', events: [] };
      }
      if (!hasComponent(ecs, command.actor, Hearing)) return { ok: false, reason: 'cannot_hear', events: [] };
      if (!hasComponent(ecs, command.listener, Hearing)) return { ok: false, reason: 'listener_cannot_hear', events: [] };

      // The answerer may only choose among THEIR OWN recorded beliefs.
      const memory = beliefsByCharacter.read(command.listener)
        .filter(b => b.claim.object === command.object);
      const statement = memory.find(b => b.evidence.kind === 'vision') ?? memory[0];
      // A guarded student may withhold an incriminating memory. Silence does
      // not forge a different claim, and the asker cannot learn the secret.
      const withheld = statement?.claim.culprit === command.listener &&
        hasComponent(ecs, command.listener, Guarded);
      const question: WorldEvent = {
        type: 'question_asked', actor: command.actor, listener: command.listener,
        object: command.object, answered: statement !== undefined && !withheld
      };
      emit(question);
      if (!statement || withheld) return { ok: true, events: [copyEvent(question)] };

      const response: WorldEvent = {
        type: 'testimony_delivered', actor: command.listener,
        listener: command.actor, claim: copyClaim(statement.claim)
      };
      emit(response);
      const origin = statement.evidence.kind === 'vision'
        ? { kind: 'vision' as const }
        : { kind: 'testimony' as const, speaker: statement.evidence.speaker };
      beliefsByCharacter.remember(command.actor, statement.claim, {
        kind: 'testimony', speaker: command.listener,
        eventSequence: events.length, origin
      });
      return { ok: true, events: [copyEvent(question), copyEvent(response)] };
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
    tick += 1;
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
    // A separate opt-in social policy keeps the original inspection policy
    // independent. One physical/social action per NPC per tick.
    for (const actor of query(ecs, [Character, SociableInvestigator])) {
      if (decisions.some(d => d.actor === actor)) continue;
      if (!hasComponent(ecs, actor, Hearing)) continue;
      const room = currentRoom(actor);
      if (room === null) continue;

      const beliefs = beliefsByCharacter.read(actor);
      const objects = [...new Set(beliefs.map(b => b.claim.object))].sort((a, b) => a - b);
      const target = objects.find(o => assessment(actor, o).status === 'contested');
      if (target === undefined) {
        searches.delete(actor);
        continue;
      }
      let search = searches.get(actor);
      if (!search || search.object !== target) {
        search = { object: target, asked: new Set(), seenRooms: new Set([room]), trail: [room] };
        searches.set(actor, search);
      }
      // If a script or player moved the character, the previous exploration
      // trail is obsolete; rebuild only from the NPC's current surroundings.
      if (search.trail.at(-1) !== room) {
        search.trail = [room];
        search.seenRooms = new Set([room]);
      }

      const sources = [...new Set(beliefs
        .filter(b => b.claim.object === target && b.evidence.kind === 'testimony')
        .map(b => b.evidence.kind === 'testimony' ? b.evidence.speaker : -1))]
        .filter(s => s !== actor && !search!.asked.has(s))
        .sort((a, b) => {
          const ranks: Record<Trust, number> = { trusted: 2, neutral: 1, distrusted: 0 };
          return ranks[trustOf(actor, b)] - ranks[trustOf(actor, a)] || a - b;
        });
      if (sources.length === 0) continue;
      const local = new Set(occupants(room));
      const interview = sources.find(s => local.has(s) && hasComponent(ecs, s, Hearing));
      if (interview !== undefined) {
        const action: Command = { type: 'ask_about', actor, listener: interview, object: target };
        const result = execute(action);
        if (result.ok) search.asked.add(interview);
        decisions.push({ actor, action, result });
        continue;
      }

      // Depth-first exploration discovers one room at a time, without knowing
      // where a source is. Only public adjacent exits are inspected.
      const unexplored = getRelationTargets(ecs, room, PassageTo)
        .filter(next => !search!.seenRooms.has(next)).sort((a, b) => a - b);
      const next = unexplored[0];
      if (next !== undefined) {
        const door = doors.get(pairKey(room, next));
        const action: Command = door !== undefined && Door.open[door] === 0
          ? { type: 'open_door', actor, door }
          : { type: 'move', actor, destination: next };
        const result = execute(action);
        if (result.ok && action.type === 'move') {
          search.seenRooms.add(next);
          search.trail.push(next);
        }
        decisions.push({ actor, action, result });
        continue;
      }
      if (search.trail.length > 1) {
        const parent = search.trail[search.trail.length - 2]!;
        const action: Command = { type: 'move', actor, destination: parent };
        const result = execute(action);
        if (result.ok) search.trail.pop();
        decisions.push({ actor, action, result });
      }
    }
    // Independent routines produce movement from explicit destination goals.
    // They use the castle's public topology, never hidden character locations.
    for (const actor of query(ecs, [Character, HasRoutine])) {
      if (decisions.some(d => d.actor === actor)) continue;
      const pending = routines.get(actor);
      const room = currentRoom(actor);
      if (!pending || room === null) continue;
      while (pending[0] === room) pending.shift();
      if (pending.length === 0) {
        setRoutine(actor, []);
        continue;
      }
      const goal = pending[0]!;
      const next = nextRoomOnRoute(room, goal,
        location => getRelationTargets(ecs, location, PassageTo));
      if (next === null) continue; // unreachable destination: do not teleport
      const door = doors.get(pairKey(room, next));
      const action: Command = door !== undefined && Door.open[door] === 0
        ? { type: 'open_door', actor, door }
        : { type: 'move', actor, destination: next };
      const result = execute(action);
      decisions.push({ actor, action, result });
      if (result.ok && action.type === 'move' && next === goal) {
        pending.shift();
        if (pending.length === 0) setRoutine(actor, []);
      }
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
    setTrust, trustOf, setInquisitive, setSocialInvestigator, setGuarded, setRoutine, assessment,
    tick: () => tick,
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
