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

export type EntityId = number;
export type Command = { type: 'move'; actor: EntityId; destination: EntityId };
export type WorldEvent = {
  type: 'entity_moved';
  actor: EntityId;
  from: EntityId;
  to: EntityId;
};
export type CommandResult =
  | { ok: true; events: readonly WorldEvent[] }
  | { ok: false; reason: MoveRejection; events: readonly [] };

/** Every new Simulation owns its ECS world AND component stores: no shared mutable state. */
export function createSimulation() {
  const ecs = createWorld();
  const Room = {};
  const Character = {};
  const Name = { value: [] as string[] };
  const LocatedIn = createRelation({ exclusive: true });
  const PassageTo = createRelation();
  const keys = new Map<string, EntityId>();
  const events: WorldEvent[] = [];

  function addNamedEntity(key: string, label: string): EntityId {
    if (keys.has(key)) throw new Error(`Duplicate entity key: ${key}`);
    const eid = addEntity(ecs);
    addComponent(ecs, eid, Name);
    Name.value[eid] = label;
    keys.set(key, eid);
    return eid;
  }

  function room(key: string, label: string): EntityId {
    const eid = addNamedEntity(key, label);
    addComponent(ecs, eid, Room);
    return eid;
  }

  function character(key: string, label: string, initialRoom: EntityId): EntityId {
    if (!entityExists(ecs, initialRoom) || !hasComponent(ecs, initialRoom, Room)) {
      throw new Error(`Invalid starting room: ${initialRoom}`);
    }
    const eid = addNamedEntity(key, label);
    addComponent(ecs, eid, Character);
    addComponent(ecs, eid, LocatedIn(initialRoom));
    return eid;
  }

  function connect(a: EntityId, b: EntityId): void {
    if (!hasComponent(ecs, a, Room) || !hasComponent(ecs, b, Room) || a === b) {
      throw new Error('Passages must connect two distinct rooms');
    }
    addComponent(ecs, a, PassageTo(b));
    addComponent(ecs, b, PassageTo(a));
  }

  function currentRoom(actor: EntityId): EntityId | null {
    if (!entityExists(ecs, actor) || !hasComponent(ecs, actor, Character)) return null;
    return getRelationTargets(ecs, actor, LocatedIn)[0] ?? null;
  }

  function execute(command: Command): CommandResult {
    const from = currentRoom(command.actor);
    const reason = validateMovement({
      actorExists: entityExists(ecs, command.actor),
      isCharacter: hasComponent(ecs, command.actor, Character),
      destinationExists: entityExists(ecs, command.destination),
      destinationIsRoom: hasComponent(ecs, command.destination, Room),
      currentRoom: from,
      destination: command.destination,
      hasPassage: from !== null && hasComponent(ecs, from, PassageTo(command.destination))
    });
    if (reason !== null) return { ok: false, reason, events: [] };

    // Exclusive relationship removes the previous LocatedIn target automatically.
    addComponent(ecs, command.actor, LocatedIn(command.destination));
    const event: WorldEvent = { type: 'entity_moved', actor: command.actor, from: from!, to: command.destination };
    events.push(event);
    return { ok: true, events: [event] };
  }

  function occupants(place: EntityId): EntityId[] {
    if (!hasComponent(ecs, place, Room)) return [];
    return Array.from(query(ecs, [Character, LocatedIn(place)]));
  }

  return {
    room, character, connect, execute, currentRoom, occupants,
    id: (key: string) => keys.get(key),
    label: (eid: EntityId) => Name.value[eid] ?? `entity#${eid}`,
    exits: (place: EntityId) => getRelationTargets(ecs, place, PassageTo),
    events: () => events.slice()
  };
}

export type Simulation = ReturnType<typeof createSimulation>;
