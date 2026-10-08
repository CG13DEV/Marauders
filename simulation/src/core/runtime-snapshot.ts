/** Materialized state schema; separate from entity/world construction blueprint. */
import type { Observation, WorldEvent, RoomDescriptor } from './Simulation.ts';
import type { Belief } from './beliefs.ts';
import type { LearningRecord } from './spellcraft.ts';
import type { AttendanceRecord, SchoolPriority } from './school-time.ts';
import type { TutoringRequest, AssistanceMemory } from './social-learning.ts';
import type { Trust } from './cognition.ts';
import type { MeetingCommitment, CommitmentMemory } from './social-commitments.ts';
import type { PersonalIntention, BodilyNeeds } from './intentions.ts';
import type {
  DailyLifePlan, MealMemory, ConversationMemory, RestMemory
} from './daily-life.ts';

export type StateFlags = {
  vision: boolean; hearing: boolean; inquisitive: boolean;
  socialInvestigator: boolean; guarded: boolean; hasRoutine: boolean;
  hasTimetable: boolean; hasDailyLife: boolean; manuallyControlled: boolean; experimental: boolean;
  illuminated: boolean; seeksHelp: boolean; helpful: boolean;
};
export type PersistedSearch = { object: number; asked: number[]; seenRooms: number[]; trail: number[] };

export type RuntimeSnapshot = {
  tick: number;
  entityKeys: [string, number][];
  roomDetails?: [number, RoomDescriptor][];
  locations: [number, number][];
  broken: [number, boolean][];
  doors: [number, boolean][];
  flags: [number, StateFlags][];
  trusts: [number, number, Trust][];
  helpedBy: [number, number][];
  observations: [number, Observation[]][];
  beliefs: [number, Belief[]][];
  learning: [number, LearningRecord[]][];
  schedules: [number, { records: AttendanceRecord[]; priority: SchoolPriority }][];
  dailyPlans: [number, DailyLifePlan][];
  meals: [number, MealMemory[]][];
  conversations: [number, ConversationMemory[]][];
  rests: [number, RestMemory[]][];
  commitments?: MeetingCommitment[];
  commitmentMemories?: [number, CommitmentMemory[]][];
  intentions?: [number,PersonalIntention[]][];
  bodilyNeeds?: [number,BodilyNeeds][];
  routines: [number, number[]][];
  searches: [number, PersistedSearch][];
  requests: [number, TutoringRequest][];
  attemptedTutors: [number, string[]][];
  assistance: [number, AssistanceMemory[]][];
  events: WorldEvent[];
};

function remapEvent(event: WorldEvent, at: (id: number) => number): WorldEvent {
  switch (event.type) {
    case 'entity_moved': return { ...event, actor: at(event.actor), from: at(event.from), to: at(event.to) };
    case 'object_broken': return { ...event, actor: at(event.actor), target: at(event.target), room: at(event.room) };
    case 'door_opened': return { ...event, actor: at(event.actor), door: at(event.door) };
    case 'testimony_delivered': return { ...event, actor: at(event.actor), listener: at(event.listener),
      claim: { ...event.claim, culprit: at(event.claim.culprit), object: at(event.claim.object) } };
    case 'object_inspected': return { ...event, actor: at(event.actor), target: at(event.target) };
    case 'question_asked': return { ...event, actor: at(event.actor), listener: at(event.listener), object: at(event.object) };
    case 'lesson_attendance': case 'spell_concept_learned': case 'spell_executed':
      return { ...event, actor: at(event.actor) };
    case 'tutoring_requested': return { ...event, actor: at(event.actor), listener: at(event.listener) };
    case 'tutoring_answered': return { ...event, actor: at(event.actor), requester: at(event.requester) };
    case 'meal_eaten': case 'rest_recorded': case 'intention_changed':
      return { ...event, actor: at(event.actor) };
    case 'conversation_shared':
      return { ...event, actor: at(event.actor), listener: at(event.listener) };
    case 'meeting_promised': case 'meeting_resolved':
    case 'meeting_offered': case 'meeting_answered':
    case 'tutoring_appointment_completed':
      return { ...event, actor: at(event.actor), listener: at(event.listener), room: at(event.room) };
  }
}

function remapObservation(record: Observation, at: (id: number) => number): Observation {
  switch (record.kind) {
    case 'heard_crash': return { ...record };
    case 'witnessed_breakage': return { ...record, actor: at(record.actor), target: at(record.target) };
    case 'inspected_object': return { ...record, target: at(record.target) };
  }
}
function remapBelief(record: Belief, at: (id: number) => number): Belief {
  const evidence = record.evidence;
  const newEvidence = evidence.kind === 'vision' ? { ...evidence } : {
    ...evidence, speaker: at(evidence.speaker),
    ...(evidence.origin?.kind === 'testimony'
      ? { origin: { kind: 'testimony' as const, speaker: at(evidence.origin.speaker) } }
      : evidence.origin ? { origin: { ...evidence.origin } } : {})
  };
  return { claim: { ...record.claim,
    culprit: at(record.claim.culprit), object: at(record.claim.object) },
    evidence: newEvidence };
}
function remapLearning(record: LearningRecord, at: (id: number) => number): LearningRecord {
  const source = record.source;
  return { ...record,
    source: source.kind === 'tutoring' || source.kind === 'guided_practice'
      ? { ...source, teacher: at(source.teacher) } : { ...source }
  };
}

/** Remapping every entity-bearing field prevents accidentally using foreign ECS IDs. */
export function remapRuntimeSnapshot(snapshot: RuntimeSnapshot, at: (id: number) => number): RuntimeSnapshot {
  return {
    tick: snapshot.tick,
    entityKeys: snapshot.entityKeys.map(([key, id]) => [key, at(id)]),
    ...(snapshot.roomDetails === undefined ? {} : {
      roomDetails: snapshot.roomDetails.map(([id, details]) => [at(id), { ...details }] as [number, RoomDescriptor])
    }),
    locations: snapshot.locations.map(([id, room]) => [at(id), at(room)]),
    broken: snapshot.broken.map(([id, value]) => [at(id), value]),
    doors: snapshot.doors.map(([id, value]) => [at(id), value]),
    flags: snapshot.flags.map(([id, flags]) => [at(id), { ...flags }]),
    trusts: snapshot.trusts.map(([observer, source, value]) => [at(observer), at(source), value]),
    helpedBy: snapshot.helpedBy.map(([student, helper]) => [at(student), at(helper)]),
    observations: snapshot.observations.map(([id, items]) => [at(id), items.map(x => remapObservation(x, at))]),
    beliefs: snapshot.beliefs.map(([id, items]) => [at(id), items.map(x => remapBelief(x, at))]),
    learning: snapshot.learning.map(([id, items]) => [at(id), items.map(x => remapLearning(x, at))]),
    schedules: snapshot.schedules.map(([id, value]) => [at(id), {
      records: value.records.map(record => ({ ...record, room: at(record.room), ...(record.teacher === undefined ? {} : { teacher: at(record.teacher) }) })), priority: value.priority
    }]),
    dailyPlans: snapshot.dailyPlans.map(([id, plan]) => [at(id), {
      ...plan, homeRoom: at(plan.homeRoom), diningRoom: at(plan.diningRoom),
      ...(plan.socialRoom === undefined ? {} : { socialRoom: at(plan.socialRoom) }),
      ...(plan.leisureRoom === undefined ? {} : { leisureRoom: at(plan.leisureRoom) })
    }]),
    meals: snapshot.meals.map(([id, values]) => [at(id), values.map(v => ({ ...v }))]),
    conversations: snapshot.conversations.map(([id, values]) => [at(id),
      values.map(v => ({ ...v, partner: at(v.partner) }))]),
    rests: snapshot.rests.map(([id, values]) => [at(id), values.map(v => ({ ...v }))]),
    ...(snapshot.commitments === undefined ? {} : {
      commitments: snapshot.commitments.map(m => ({...m,
        promisor: at(m.promisor), beneficiary: at(m.beneficiary), room: at(m.room)}))
    }),
    ...(snapshot.commitmentMemories === undefined ? {} : {
      commitmentMemories: snapshot.commitmentMemories.map(([id, memories]) => [
        at(id), memories.map(m => ({...m, partner:at(m.partner), room:at(m.room)}))
      ] as [number, CommitmentMemory[]])
    }),
    ...(snapshot.intentions===undefined?{}:{intentions:snapshot.intentions.map(
      ([actor,goals]):[number,PersonalIntention[]]=>[
        at(actor),goals.map(g=>({...g,destination:at(g.destination)}))
      ]
    )}),
    ...(snapshot.bodilyNeeds===undefined?{}:{bodilyNeeds:snapshot.bodilyNeeds.map(
      ([actor,needs])=>[at(actor),{...needs}] as [number,BodilyNeeds]
    )}),
    routines: snapshot.routines.map(([id, path]) => [at(id), path.map(at)]),
    searches: snapshot.searches.map(([id, search]) => [at(id), {
      object: at(search.object), asked: search.asked.map(at),
      seenRooms: search.seenRooms.map(at), trail: search.trail.map(at)
    }]),
    requests: snapshot.requests.map(([id, request]) => [at(id), {
      ...request, requester: at(request.requester), helper: at(request.helper)
    }]),
    attemptedTutors: snapshot.attemptedTutors.map(([id, attempted]) => [at(id),
      attempted.map(value => {
        const [speaker, spell] = value.split(':');
        if (!speaker || !spell) throw new Error('Malformed remembered tutoring attempt');
        return at(Number(speaker)) + ':' + spell;
      })
    ]),
    assistance: snapshot.assistance.map(([id, memories]) => [at(id),
      memories.map(x => ({ ...x, helper: at(x.helper) }))]),
    events: snapshot.events.map(x => remapEvent(x, at))
  };
}
