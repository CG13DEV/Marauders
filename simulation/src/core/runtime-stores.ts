/** Runtime-owned stores: exactly one instance per ECS world, never globals. */
import { createBeliefStore } from './beliefs.ts';
import { createSpellKnowledge } from './spellcraft.ts';
import type { EntityId, Observation, WorldEvent } from './Simulation.ts';
import type { TutoringRequest, AssistanceMemory } from './social-learning.ts';
import type { AttendanceRecord, SchoolPriority } from './school-time.ts';

export type WitnessSearch = {
  object: EntityId;
  asked: Set<EntityId>;
  seenRooms: Set<EntityId>;
  trail: EntityId[];
};

export type TimetableState = {
  records: AttendanceRecord[];
  priority: SchoolPriority;
};

/** One factory = one fully isolated simulation's mutable ledgers. */
export function createRuntimeStores() {
  return {
    keys: new Map<string, EntityId>(),
    doors: new Map<string, EntityId>(),
    events: [] as WorldEvent[],
    observationsByCharacter: new Map<EntityId, Observation[]>(),
    beliefsByCharacter: createBeliefStore(),
    spellKnowledge: createSpellKnowledge(),
    pendingTutoring: new Map<EntityId, TutoringRequest>(),
    attemptedTutors: new Map<EntityId, Set<string>>(),
    assistanceHistory: new Map<EntityId, AssistanceMemory[]>(),
    searches: new Map<EntityId, WitnessSearch>(),
    routines: new Map<EntityId, EntityId[]>(),
    timetables: new Map<EntityId, TimetableState>()
  };
}
