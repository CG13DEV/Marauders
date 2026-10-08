/**
 * [GAME] Persistence boundary, v1: deterministic intent journal + integrity
 * audit. It is purposefully kept OUTSIDE the ECS simulation kernel.
 *
 * Saves are reconstructible and play can continue after restore. Restoration
 * costs O(all recorded operations); compact materialized checkpoints and DB
 * persistence are separate future milestones.
 */
import { createSimulation, type Command, type EntityId, type Simulation } from './Simulation.ts';
import type { DoorOptions } from './Simulation.ts';
import type { Trust } from './cognition.ts';
import type { SpellId, SpellStage } from './spellcraft.ts';
import type { Lesson, SchoolPriority } from './school-time.ts';
import type { DailyLifePlan } from './daily-life.ts';
import { remapRuntimeSnapshot, type RuntimeSnapshot } from './runtime-snapshot.ts';

type EntityCreation =
  | { kind: 'room'; key: string; label: string; id: number }
  | { kind: 'character'; key: string; label: string; initialRoom: number; senses?: { vision?: boolean; hearing?: boolean }; id: number }
  | { kind: 'fragileObject'; key: string; label: string; initialRoom: number; id: number }
  | { kind: 'connect'; a: number; b: number; options?: DoorOptions; doorId?: number };

type Operation = EntityCreation
  | { kind: 'execute'; command: Command }
  | { kind: 'step' }
  | { kind: 'setTrust'; observer: number; source: number; value: Trust }
  | { kind: 'setInquisitive' | 'setSocialInvestigator' | 'setGuarded' | 'setHelpSeeking' | 'setHelpful' | 'setExperimenter' | 'setManualControl'; actor: number; enabled: boolean }
  | { kind: 'setRoutine'; actor: number; destinations: number[] }
  | { kind: 'setTimetable'; actor: number; lessons: Lesson[]; priority?: SchoolPriority }
  | { kind: 'setDailyLife'; actor: number; plan: DailyLifePlan | null }
  | { kind: 'seedSpellKnowledge'; actor: number; spell: SpellId; stage: Exclude<SpellStage, 'unaware'> };

export type SavedCheckpointV2 = {
  format: 'marauders.checkpoint';
  version: 2;
  /** Entity creation and topology only. No historical actions or ticks. */
  setup: EntityCreation[];
  /** Full materialized runtime, including personal memories and goals. */
  runtime: RuntimeSnapshot;
};

export type SavedSimulationV1 = {
  format: 'marauders.headless';
  version: 1;
  operations: Operation[];
  audit: string;
};

const copy = <T>(input: T): T => JSON.parse(JSON.stringify(input)) as T;

function remapId(id: number, ids: Map<number, number>): number {
  const result = ids.get(id);
  if (result === undefined) throw new Error('Save references an entity before its creation: ' + id);
  return result;
}

function remapCommand(command: Command, ids: Map<number, number>): Command {
  const at = (eid: number) => remapId(eid, ids);
  switch (command.type) {
    case 'move': return { ...command, actor: at(command.actor), destination: at(command.destination) };
    case 'break_object': return { ...command, actor: at(command.actor), target: at(command.target) };
    case 'open_door': return { ...command, actor: at(command.actor), door: at(command.door) };
    case 'tell': return { ...command, actor: at(command.actor), listener: at(command.listener),
      claim: { ...command.claim, culprit: at(command.claim.culprit), object: at(command.claim.object) } };
    case 'inspect_object': return { ...command, actor: at(command.actor), target: at(command.target) };
    case 'ask_about': return { ...command, actor: at(command.actor), listener: at(command.listener), object: at(command.object) };
    case 'tutor_spell': return { ...command, actor: at(command.actor), listener: at(command.listener) };
    case 'ask_tutoring': return { ...command, actor: at(command.actor), listener: at(command.listener) };
    case 'answer_tutoring': return { ...command, actor: at(command.actor), requester: at(command.requester) };
    case 'practice_spell': return { ...command, actor: at(command.actor),
      ...(command.guide === undefined ? {} : { guide: at(command.guide) }) };
    case 'cast_spell': return { ...command, actor: at(command.actor) };
    case 'eat_meal': return { ...command, actor: at(command.actor) };
    case 'chat': return { ...command, actor: at(command.actor), listener: at(command.listener) };
    default: throw new Error('Unknown replay command');
  }
}

/** Render references in audit snapshots as stable entity keys, never raw ECS IDs. */
function canonicalize(value: unknown, idToKey: Map<number, string>): unknown {
  const entityFields = new Set([
    'actor', 'listener', 'requester', 'helper', 'teacher', 'culprit', 'object',
    'target', 'door', 'from', 'to', 'room', 'destination', 'source', 'observer', 'partner'
  ]);
  function recur(input: unknown, parent?: string): unknown {
    if (Array.isArray(input)) return input.map(x => recur(x));
    if (input !== null && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input).map(([key, item]) =>
        [key, recur(item, key)]));
    }
    if (typeof input === 'number' && parent && entityFields.has(parent) &&
        idToKey.has(input)) return idToKey.get(input);
    return input;
  }
  return recur(value);
}

function auditOf(world: Simulation, operations: readonly Operation[]): string {
  const idToKey = new Map<number, string>();
  for (const op of operations) {
    if (op.kind === 'room' || op.kind === 'character' || op.kind === 'fragileObject')
      idToKey.set(op.id, op.key);
    if (op.kind === 'connect' && op.doorId !== undefined)
      idToKey.set(op.doorId, op.options?.door.key ?? 'unnamed-door');
  }
  const characters = operations.filter((o): o is Extract<EntityCreation, { kind: 'character' }> =>
    o.kind === 'character');
  const objects = operations.filter((o): o is Extract<EntityCreation, { kind: 'fragileObject' }> =>
    o.kind === 'fragileObject');
  const doors = operations.filter((o): o is Extract<EntityCreation, { kind: 'connect' }> =>
    o.kind === 'connect').filter(o => o.doorId !== undefined);
  const trustPairs = new Set<string>();
  for (const op of operations) {
    if (op.kind === 'setTrust') trustPairs.add(op.observer + ':' + op.source);
  }
  const audit = {
    tick: world.tick(),
    events: world.events(),
    characters: characters.map(c => ({
      key: c.key, room: world.currentRoom(c.id),
      observations: world.observations(c.id),
      beliefs: world.beliefs(c.id), attendance: world.attendance(c.id),
      learning: world.learningHistory(c.id), gaps: world.knowledgeGaps(c.id),
      illuminated: world.isIlluminated(c.id),
      request: world.tutoringRequest(c.id), help: world.assistance(c.id),
      meals: world.mealHistory(c.id),
      conversations: world.conversationHistory(c.id),
      rests: world.restHistory(c.id)
    })),
    objects: objects.map(o => ({ key: o.key, room: world.locationOf(o.id), broken: world.isBroken(o.id) })),
    doors: doors.map(o => ({ key: o.options?.door.key, open: world.doorIsOpen(o.doorId!) })),
    trust: [...trustPairs].sort().map(pair => {
      const [observer, source] = pair.split(':').map(Number);
      return { observer, source, value: world.trustOf(observer!, source!) };
    })
  };
  return JSON.stringify(canonicalize(audit, idToKey));
}

function createFacade(world: Simulation, operations: Operation[]) {
  let checkpointRooted = false;
  // All externally initiated mutations go through this boundary. Commands
  // initiated by world.step() stay internal, so nothing is double-recorded.
  const facade = {
    ...world,
    room(key: string, label: string) {
      const id = world.room(key, label);
      operations.push({ kind: 'room', key, label, id });
      return id;
    },
    character(key: string, label: string, initialRoom: number, senses?: { vision?: boolean; hearing?: boolean }) {
      const id = world.character(key, label, initialRoom, senses);
      operations.push(copy({ kind: 'character', key, label, initialRoom, senses, id }));
      return id;
    },
    fragileObject(key: string, label: string, initialRoom: number) {
      const id = world.fragileObject(key, label, initialRoom);
      operations.push({ kind: 'fragileObject', key, label, initialRoom, id });
      return id;
    },
    connect(a: number, b: number, options?: DoorOptions) {
      const doorId = world.connect(a, b, options);
      operations.push(copy({ kind: 'connect', a, b, options, doorId }));
      return doorId;
    },
    execute(command: Command) {
      const result = world.execute(command);
      if (result.ok) operations.push({ kind: 'execute', command: copy(command) });
      return result;
    },
    step() {
      const result = world.step();
      operations.push({ kind: 'step' });
      return result;
    },
    setTrust(observer: number, source: number, value: Trust) {
      world.setTrust(observer, source, value);
      operations.push({ kind: 'setTrust', observer, source, value });
    },
    setManualControl(actor: number, enabled: boolean) {
      world.setManualControl(actor, enabled);
      operations.push({ kind: 'setManualControl', actor, enabled });
    },
    setInquisitive(actor: number, enabled: boolean) {
      world.setInquisitive(actor, enabled);
      operations.push({ kind: 'setInquisitive', actor, enabled });
    },
    setSocialInvestigator(actor: number, enabled: boolean) {
      world.setSocialInvestigator(actor, enabled);
      operations.push({ kind: 'setSocialInvestigator', actor, enabled });
    },
    setGuarded(actor: number, enabled: boolean) {
      world.setGuarded(actor, enabled);
      operations.push({ kind: 'setGuarded', actor, enabled });
    },
    setHelpSeeking(actor: number, enabled: boolean) {
      world.setHelpSeeking(actor, enabled);
      operations.push({ kind: 'setHelpSeeking', actor, enabled });
    },
    setHelpful(actor: number, enabled: boolean) {
      world.setHelpful(actor, enabled);
      operations.push({ kind: 'setHelpful', actor, enabled });
    },
    setExperimenter(actor: number, enabled: boolean) {
      world.setExperimenter(actor, enabled);
      operations.push({ kind: 'setExperimenter', actor, enabled });
    },
    setRoutine(actor: number, destinations: readonly number[]) {
      world.setRoutine(actor, destinations);
      operations.push({ kind: 'setRoutine', actor, destinations: [...destinations] });
    },
    setDailyLife(actor: number, plan: DailyLifePlan | null) {
      world.setDailyLife(actor, plan);
      operations.push({ kind: 'setDailyLife', actor, plan: copy(plan) });
    },
    setTimetable(actor: number, lessons: readonly Lesson[], priority?: SchoolPriority) {
      world.setTimetable(actor, lessons, priority);
      operations.push(copy({ kind: 'setTimetable', actor, lessons: [...lessons], priority }));
    },
    seedSpellKnowledge(actor: number, spell: SpellId, stage: Exclude<SpellStage, 'unaware'>) {
      world.seedSpellKnowledge(actor, spell, stage);
      operations.push({ kind: 'seedSpellKnowledge', actor, spell, stage });
    },
    /** Materialized checkpoint: never replays past ticks upon restoration. */
    checkpoint(): SavedCheckpointV2 {
      const setup = operations.filter((op): op is EntityCreation =>
        op.kind === 'room' || op.kind === 'character' ||
        op.kind === 'fragileObject' || op.kind === 'connect');
      return {
        format: 'marauders.checkpoint', version: 2,
        setup: copy(setup), runtime: world.captureRuntime()
      };
    },
    markCheckpointRooted() { checkpointRooted = true; },
    isCheckpointRooted() { return checkpointRooted; },
    snapshot(): SavedSimulationV1 {
      if (checkpointRooted) throw new Error(
        'A materialized checkpoint has no complete replay journal; use checkpoint()');
      return { format: 'marauders.headless', version: 1, operations: copy(operations),
        audit: auditOf(world, operations) };
    }
  };
  return facade;
}

export type PersistentSimulation = ReturnType<typeof createPersistentSimulation>;

export function createPersistentSimulation() {
  return createFacade(createSimulation(), []);
}

/** JSON is portable: persist bytes using a caller-owned filesystem or DB. */
export function serializeCheckpoint(world: PersistentSimulation): string {
  return JSON.stringify(world.checkpoint());
}

export function serializeSimulation(world: PersistentSimulation): string {
  return world.isCheckpointRooted()
    ? serializeCheckpoint(world) : JSON.stringify(world.snapshot());
}

/** Restore static entity graph then hydrate all mutable state; O(current world size). */
export function restoreCheckpoint(serialized: string | SavedCheckpointV2): PersistentSimulation {
  const save: SavedCheckpointV2 = typeof serialized === 'string' ? JSON.parse(serialized) : copy(serialized);
  if (save?.format !== 'marauders.checkpoint' || save.version !== 2 ||
      !Array.isArray(save.setup) || !save.runtime ||
      !Array.isArray(save.runtime.entityKeys)) {
    throw new Error('Unsupported or invalid checkpoint format');
  }
  const restored = createPersistentSimulation();
  const ids = new Map<number, number>();
  const at = (id: number) => remapId(id, ids);
  for (const op of save.setup) {
    switch (op.kind) {
      case 'room': ids.set(op.id, restored.room(op.key, op.label)); break;
      case 'character':
        ids.set(op.id, restored.character(op.key, op.label, at(op.initialRoom), op.senses));
        break;
      case 'fragileObject':
        ids.set(op.id, restored.fragileObject(op.key, op.label, at(op.initialRoom)));
        break;
      case 'connect': {
        const newDoor = restored.connect(at(op.a), at(op.b), op.options);
        if (op.doorId !== undefined) {
          if (newDoor === undefined) throw new Error('Missing checkpoint door');
          ids.set(op.doorId, newDoor);
        }
        break;
      }
      default: throw new Error('Checkpoint setup must contain only entity creation');
    }
  }
  const state = remapRuntimeSnapshot(save.runtime, at);
  restored.hydrateRuntime(state);
  if (JSON.stringify(restored.captureRuntime()) !== JSON.stringify(state)) {
    throw new Error('Materialized checkpoint diverged during hydration');
  }
  restored.markCheckpointRooted();
  return restored;
}

export function restoreSimulation(serialized: string | SavedSimulationV1 | SavedCheckpointV2): PersistentSimulation {
  const save: SavedSimulationV1 | SavedCheckpointV2 = typeof serialized === 'string' ? JSON.parse(serialized) : copy(serialized);
  if (save?.format === 'marauders.checkpoint' && save.version === 2)
    return restoreCheckpoint(save as SavedCheckpointV2);
  if (save?.format !== 'marauders.headless' || save.version !== 1 ||
      !Array.isArray(save.operations) || typeof save.audit !== 'string') {
    throw new Error('Unsupported or invalid Marauders save format');
  }
  const restored = createPersistentSimulation();
  const ids = new Map<number, number>();
  const at = (x: number) => remapId(x, ids);
  for (const op of save.operations) {
    if (!op || typeof op.kind !== 'string') throw new Error('Invalid journal operation');
    switch (op.kind) {
      case 'room': ids.set(op.id, restored.room(op.key, op.label)); break;
      case 'character': ids.set(op.id, restored.character(op.key, op.label, at(op.initialRoom), op.senses)); break;
      case 'fragileObject': ids.set(op.id, restored.fragileObject(op.key, op.label, at(op.initialRoom))); break;
      case 'connect': {
        const newDoor = restored.connect(at(op.a), at(op.b), op.options);
        if (op.doorId !== undefined) {
          if (newDoor === undefined) throw new Error('Door missing during replay');
          ids.set(op.doorId, newDoor);
        }
        break;
      }
      case 'execute': {
        const outcome = restored.execute(remapCommand(op.command, ids));
        if (!outcome.ok) throw new Error('Replayed command rejected: ' + outcome.reason);
        break;
      }
      case 'step': restored.step(); break;
      case 'setTrust': restored.setTrust(at(op.observer), at(op.source), op.value); break;
      case 'setManualControl': restored.setManualControl(at(op.actor), op.enabled); break;
      case 'setInquisitive': restored.setInquisitive(at(op.actor), op.enabled); break;
      case 'setSocialInvestigator': restored.setSocialInvestigator(at(op.actor), op.enabled); break;
      case 'setGuarded': restored.setGuarded(at(op.actor), op.enabled); break;
      case 'setHelpSeeking': restored.setHelpSeeking(at(op.actor), op.enabled); break;
      case 'setHelpful': restored.setHelpful(at(op.actor), op.enabled); break;
      case 'setExperimenter': restored.setExperimenter(at(op.actor), op.enabled); break;
      case 'setRoutine': restored.setRoutine(at(op.actor), op.destinations.map(at)); break;
      case 'setTimetable': restored.setTimetable(at(op.actor), op.lessons.map(l => ({ ...l, room: at(l.room) })), op.priority); break;
      case 'setDailyLife': restored.setDailyLife(at(op.actor), op.plan
        ? { ...op.plan, homeRoom: at(op.plan.homeRoom), diningRoom: at(op.plan.diningRoom),
          ...(op.plan.socialRoom === undefined ? {} : { socialRoom: at(op.plan.socialRoom) }),
          ...(op.plan.leisureRoom === undefined ? {} : { leisureRoom: at(op.plan.leisureRoom) }) }
        : null); break;
      case 'seedSpellKnowledge': restored.seedSpellKnowledge(at(op.actor), op.spell, op.stage); break;
      default: throw new Error('Unsupported journal operation: ' + (op as Operation).kind);
    }
  }
  // Saved ECS IDs may differ from new ones: compare canonical entity keys.
  // Convert the ORIGINAL audit to the new IDs by comparing key-level records
  // (the replay operation IDs are new, but both audits canonicalize them).
  if (restored.snapshot().audit !== save.audit)
    throw new Error('Save replay diverged from original world state');
  return restored;
}
