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
import {
  schoolTime, validateTimetable, currentLesson, registerAttendance,
  type Lesson, type AttendanceRecord, type SchoolPriority
} from './school-time.ts';
import {
  createSpellKnowledge, spellDefinitions, isSpellId,
  type SpellId, type SpellStage, type LearningRecord
} from './spellcraft.ts';
import {
  willingToTutor, copyRequest,
  type TutoringRequest, type AssistanceMemory
} from './social-learning.ts';

export type EntityId = number;

export type Command =
  | { type: 'move'; actor: EntityId; destination: EntityId }
  | { type: 'break_object'; actor: EntityId; target: EntityId }
  | { type: 'open_door'; actor: EntityId; door: EntityId }
  | { type: 'tell'; actor: EntityId; listener: EntityId; claim: Claim }
  | { type: 'inspect_object'; actor: EntityId; target: EntityId }
  | { type: 'ask_about'; actor: EntityId; listener: EntityId; object: EntityId }
  | { type: 'tutor_spell'; actor: EntityId; listener: EntityId; spell: SpellId }
  | { type: 'practice_spell'; actor: EntityId; spell: SpellId; guide?: EntityId; intent: string; target: string; incantation: string }
  | { type: 'cast_spell'; actor: EntityId; spell: SpellId; intent: string; target: string; incantation: string }
  | { type: 'ask_tutoring'; actor: EntityId; listener: EntityId; spell: SpellId }
  | { type: 'answer_tutoring'; actor: EntityId; requester: EntityId; spell: SpellId; accept: boolean };

export type WorldEvent =
  | { type: 'entity_moved'; actor: EntityId; from: EntityId; to: EntityId }
  | { type: 'object_broken'; actor: EntityId; target: EntityId; room: EntityId }
  | { type: 'door_opened'; actor: EntityId; door: EntityId }
  | { type: 'testimony_delivered'; actor: EntityId; listener: EntityId; claim: Claim }
  | { type: 'object_inspected'; actor: EntityId; target: EntityId; broken: boolean }
  | { type: 'question_asked'; actor: EntityId; listener: EntityId; object: EntityId; answered: boolean }
  | { type: 'lesson_attendance'; actor: EntityId; lessonId: string; status: 'on_time' | 'late' | 'missed'; minute: number }
  | { type: 'spell_concept_learned'; actor: EntityId; spell: SpellId; source: 'lesson' | 'tutoring'; minute: number }
  | { type: 'spell_executed'; actor: EntityId; spell: SpellId; mode: 'guided' | 'independent'; minute: number }
  | { type: 'tutoring_requested'; actor: EntityId; listener: EntityId; spell: SpellId; minute: number }
  | { type: 'tutoring_answered'; actor: EntityId; requester: EntityId; spell: SpellId; accepted: boolean; minute: number };

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

export type SpellRejection =
  | 'unknown_spell' | 'not_understood' | 'guide_required'
  | 'invalid_guide' | 'guide_unqualified' | 'pattern_mismatch' | 'not_practiced'
  | 'speaker_cannot_hear' | 'student_cannot_hear' | 'already_understood';

export type HelpRejection =
  | 'not_missing_concept' | 'already_requested' | 'no_pending_request'
  | 'not_colocated' | 'cannot_hear' | 'invalid_helper' | 'invalid_requester'
  | 'not_character';

export type CommandResult =
  | { ok: true; events: readonly WorldEvent[] }
  | { ok: false; reason: MoveRejection | BreakRejection | SocialRejection | DoorRejection | InspectRejection | QuestionRejection | SpellRejection | HelpRejection; events: readonly [] };

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
  const HasTimetable = {};
  const ManuallyControlled = {};
  const Experimental = {};
  const Illuminated = {};
  const SeeksHelp = {};
  const Helpful = {};
  const HelpedBy = createRelation();
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
  const spellKnowledge = createSpellKnowledge();
  const pendingTutoring = new Map<EntityId, TutoringRequest>();
  const attemptedTutors = new Map<EntityId, Set<string>>();
  const assistanceHistory = new Map<EntityId, AssistanceMemory[]>();
  // Goals remember what has been attempted, not secret NPC locations.
  type Search = {
    object: EntityId;
    asked: Set<EntityId>;
    seenRooms: Set<EntityId>;
    trail: EntityId[];
  };
  const searches = new Map<EntityId, Search>();
  const routines = new Map<EntityId, EntityId[]>();
  const timetables = new Map<EntityId, { records: AttendanceRecord[]; priority: SchoolPriority }>();
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
    spellKnowledge.register(eid);
    attemptedTutors.set(eid, new Set());
    assistanceHistory.set(eid, []);
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

  /** Player and AI are the same world entities; only the action source differs. */
  function setManualControl(actor: EntityId, enabled: boolean): void {
    if (!isCharacter(actor)) throw new Error('Manual control requires a character');
    if (enabled) addComponent(ecs, actor, ManuallyControlled);
    else removeComponent(ecs, actor, ManuallyControlled);
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

  function setTimetable(actor: EntityId, lessons: readonly Lesson[], priority: SchoolPriority = 'lesson_first'): void {
    if (!isCharacter(actor)) throw new Error('Timetable requires a character');
    if (priority !== 'lesson_first' && priority !== 'inquiry_first') {
      throw new Error('Invalid school priority');
    }
    validateTimetable(lessons);
    if (lessons.some(lesson => !isRoom(lesson.room))) {
      throw new Error('Timetable destinations must be rooms');
    }
    if (lessons.length === 0) {
      timetables.delete(actor);
      removeComponent(ecs, actor, HasTimetable);
      return;
    }
    timetables.set(actor, {
      records: lessons.map(lesson => ({ ...lesson, status: 'pending' as const })),
      priority
    });
    addComponent(ecs, actor, HasTimetable);
  }

  function attendance(actor: EntityId): AttendanceRecord[] {
    return (timetables.get(actor)?.records ?? []).map(lesson => ({ ...lesson }));
  }

  function learningDebt(actor: EntityId): number {
    return attendance(actor).filter(lesson => lesson.status === 'missed').length;
  }

  /** Prior training is explicit scenario initialisation, never automatic from a claim. */
  function seedSpellKnowledge(actor: EntityId, spell: SpellId, stage: Exclude<SpellStage, 'unaware'>): void {
    if (tick > 0 || !isCharacter(actor) || !isSpellId(spell)) {
      throw new Error('Prior learning must be configured before the first world tick');
    }
    spellKnowledge.learn(actor, spell, stage, { kind: 'prior_training' });
  }

  function setHelpSeeking(actor: EntityId, enabled: boolean): void {
    if (!isCharacter(actor)) throw new Error('Help seeking requires a character');
    if (enabled) addComponent(ecs, actor, SeeksHelp);
    else removeComponent(ecs, actor, SeeksHelp);
  }

  function setHelpful(actor: EntityId, enabled: boolean): void {
    if (!isCharacter(actor)) throw new Error('Willingness to help requires a character');
    if (enabled) addComponent(ecs, actor, Helpful);
    else removeComponent(ecs, actor, Helpful);
  }

  function tutoringRequest(actor: EntityId): TutoringRequest | null {
    const request = pendingTutoring.get(actor);
    return request ? copyRequest(request) : null;
  }

  function assistance(actor: EntityId): AssistanceMemory[] {
    return (assistanceHistory.get(actor) ?? []).map(a => ({ ...a }));
  }

  function hasHelped(helper: EntityId, learner: EntityId): boolean {
    return isCharacter(helper) && isCharacter(learner) &&
      hasComponent(ecs, learner, HelpedBy(helper));
  }

  function setExperimenter(actor: EntityId, enabled: boolean): void {
    if (!isCharacter(actor)) throw new Error('Experimenter must be a character');
    if (enabled) addComponent(ecs, actor, Experimental);
    else removeComponent(ecs, actor, Experimental);
  }

  function spellStage(actor: EntityId, spell: SpellId): SpellStage {
    return spellKnowledge.stage(actor, spell);
  }

  function isIlluminated(actor: EntityId): boolean {
    return isCharacter(actor) && hasComponent(ecs, actor, Illuminated);
  }

  function knowledgeGaps(actor: EntityId): SpellId[] {
    if (!isCharacter(actor)) return [];
    const lessons = timetables.get(actor)?.records ?? [];
    const known = new Set<SpellId>();
    for (const lesson of lessons) {
      if (!lesson.spell || schoolTime(tick).absoluteMinute < lesson.startsAt + 10 ||
          spellKnowledge.stage(actor, lesson.spell) !== 'unaware') continue;
      known.add(lesson.spell);
    }
    return [...known];
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
    if (command.type === 'ask_tutoring') {
      if (!isSpellId(command.spell)) return { ok: false, reason: 'unknown_spell', events: [] };
      if (!isCharacter(command.listener) || command.actor === command.listener) {
        return { ok: false, reason: 'invalid_helper', events: [] };
      }
      if (!knowledgeGaps(command.actor).includes(command.spell)) {
        return { ok: false, reason: 'not_missing_concept', events: [] };
      }
      if (pendingTutoring.has(command.actor) ||
          attemptedTutors.get(command.actor)!.has(`${command.listener}:${command.spell}`)) {
        return { ok: false, reason: 'already_requested', events: [] };
      }
      if (currentRoom(command.actor) === null ||
          currentRoom(command.actor) !== currentRoom(command.listener)) {
        return { ok: false, reason: 'not_colocated', events: [] };
      }
      if (!hasComponent(ecs, command.actor, Hearing) ||
          !hasComponent(ecs, command.listener, Hearing)) {
        return { ok: false, reason: 'cannot_hear', events: [] };
      }
      const minute = schoolTime(tick).absoluteMinute;
      pendingTutoring.set(command.actor, {
        requester: command.actor, helper: command.listener, spell: command.spell, minute
      });
      attemptedTutors.get(command.actor)!.add(`${command.listener}:${command.spell}`);
      const event: WorldEvent = {
        type: 'tutoring_requested', actor: command.actor, listener: command.listener,
        spell: command.spell, minute
      };
      emit(event);
      return { ok: true, events: [event] };
    }

    if (command.type === 'answer_tutoring') {
      if (!isSpellId(command.spell)) return { ok: false, reason: 'unknown_spell', events: [] };
      if (!isCharacter(command.requester) || command.actor === command.requester) {
        return { ok: false, reason: 'invalid_requester', events: [] };
      }
      const pending = pendingTutoring.get(command.requester);
      if (!pending || pending.helper !== command.actor || pending.spell !== command.spell) {
        return { ok: false, reason: 'no_pending_request', events: [] };
      }
      if (currentRoom(command.actor) === null ||
          currentRoom(command.actor) !== currentRoom(command.requester)) {
        return { ok: false, reason: 'not_colocated', events: [] };
      }
      if (!hasComponent(ecs, command.actor, Hearing) ||
          !hasComponent(ecs, command.requester, Hearing)) {
        return { ok: false, reason: 'cannot_hear', events: [] };
      }
      let lessonEvents: readonly WorldEvent[] = [];
      if (command.accept) {
        // Reuse the canonical, guarded teaching action. Helping cannot magic
        // knowledge into existence or bypass the ordinary eligibility rules.
        const taught = execute({
          type: 'tutor_spell', actor: command.actor,
          listener: command.requester, spell: command.spell
        });
        if (!taught.ok) return taught;
        lessonEvents = taught.events;
        addComponent(ecs, command.requester, HelpedBy(command.actor));
        assistanceHistory.get(command.requester)!.push({
          helper: command.actor, spell: command.spell,
          minute: schoolTime(tick).absoluteMinute
        });
      }
      pendingTutoring.delete(command.requester);
      const response: WorldEvent = {
        type: 'tutoring_answered', actor: command.actor, requester: command.requester,
        spell: command.spell, accepted: command.accept,
        minute: schoolTime(tick).absoluteMinute
      };
      emit(response);
      return { ok: true, events: [...lessonEvents, response] };
    }

    if (command.type === 'tutor_spell') {
      if (!isSpellId(command.spell)) return { ok: false, reason: 'unknown_spell', events: [] };
      if (!isCharacter(command.listener) || command.actor === command.listener) {
        return { ok: false, reason: 'invalid_guide', events: [] };
      }
      if (currentRoom(command.actor) === null || currentRoom(command.actor) !== currentRoom(command.listener)) {
        return { ok: false, reason: 'not_colocated', events: [] };
      }
      if (!hasComponent(ecs, command.actor, Hearing)) {
        return { ok: false, reason: 'speaker_cannot_hear', events: [] };
      }
      if (!hasComponent(ecs, command.listener, Hearing)) {
        return { ok: false, reason: 'student_cannot_hear', events: [] };
      }
      if (spellKnowledge.stage(command.actor, command.spell) === 'unaware') {
        return { ok: false, reason: 'not_understood', events: [] };
      }
      if (spellKnowledge.stage(command.listener, command.spell) !== 'unaware') {
        return { ok: false, reason: 'already_understood', events: [] };
      }
      spellKnowledge.learn(command.listener, command.spell, 'conceptual',
        { kind: 'tutoring', teacher: command.actor, minute: schoolTime(tick).absoluteMinute });
      const event: WorldEvent = {
        type: 'spell_concept_learned', actor: command.listener,
        spell: command.spell, source: 'tutoring', minute: schoolTime(tick).absoluteMinute
      };
      emit(event);
      return { ok: true, events: [event] };
    }

    if (command.type === 'practice_spell' || command.type === 'cast_spell') {
      if (!isSpellId(command.spell)) return { ok: false, reason: 'unknown_spell', events: [] };
      const pattern = spellDefinitions[command.spell];
      if (command.intent !== pattern.intent || command.target !== pattern.semanticTarget ||
          command.incantation !== pattern.incantation) {
        return { ok: false, reason: 'pattern_mismatch', events: [] };
      }
      const stage = spellKnowledge.stage(command.actor, command.spell);
      if (stage === 'unaware') return { ok: false, reason: 'not_understood', events: [] };
      if (command.type === 'cast_spell' && stage !== 'independent') {
        return { ok: false, reason: 'not_practiced', events: [] };
      }
      if (command.type === 'practice_spell' && stage === 'conceptual') {
        if (command.guide === undefined) return { ok: false, reason: 'guide_required', events: [] };
        if (!isCharacter(command.guide) || command.guide === command.actor ||
            currentRoom(command.actor) !== currentRoom(command.guide)) {
          return { ok: false, reason: 'invalid_guide', events: [] };
        }
        if (spellKnowledge.stage(command.guide, command.spell) !== 'independent') {
          return { ok: false, reason: 'guide_unqualified', events: [] };
        }
      }
      if (pattern.operation === 'emit_light') addComponent(ecs, command.actor, Illuminated);
      if (command.type === 'practice_spell' && stage === 'conceptual') {
        spellKnowledge.learn(command.actor, command.spell, 'guided',
          { kind: 'guided_practice', teacher: command.guide!, minute: schoolTime(tick).absoluteMinute });
      } else if (command.type === 'practice_spell' && stage === 'guided') {
        spellKnowledge.learn(command.actor, command.spell, 'independent',
          { kind: 'independent_practice', minute: schoolTime(tick).absoluteMinute });
      }
      const event: WorldEvent = {
        type: 'spell_executed', actor: command.actor, spell: command.spell,
        mode: command.type === 'practice_spell' && stage === 'conceptual' ? 'guided' : 'independent',
        minute: schoolTime(tick).absoluteMinute
      };
      emit(event);
      return { ok: true, events: [event] };
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
    const minute = schoolTime(tick).absoluteMinute;
    const decisions: { actor: EntityId; action: Command; result: CommandResult }[] = [];
    const occupiedBySchool = new Set<EntityId>();
    const socialParticipants = new Set<EntityId>();

    function travelTowardLesson(actor: EntityId, room: EntityId, goal: EntityId): void {
      if (room === goal) return;
      const next = nextRoomOnRoute(room, goal,
        location => getRelationTargets(ecs, location, PassageTo));
      if (next === null) return;
      const door = doors.get(pairKey(room, next));
      const action: Command = door !== undefined && Door.open[door] === 0
        ? { type: 'open_door', actor, door }
        : { type: 'move', actor, destination: next };
      const result = execute(action);
      decisions.push({ actor, action, result });
    }

    // Lesson-first pupils reserve the school period and prepare ahead of time.
    // Other pupils may continue investigating, at the cost of late attendance.
    for (const actor of query(ecs, [Character, HasTimetable])) {
      const timetable = timetables.get(actor);
      const room = currentRoom(actor);
      if (!timetable || room === null || timetable.priority !== 'lesson_first' ||
          hasComponent(ecs, actor, ManuallyControlled)) continue;
      const lesson = currentLesson(timetable.records, minute);
      if (!lesson) continue;
      occupiedBySchool.add(actor);
      travelTowardLesson(actor, room, lesson.room);
    }

    // First, helpers respond to requests they actually heard earlier. Being
    // busy with a scheduled lesson defers help; no involuntary class skipping.
    // One response consumes one NPC action this tick.
    for (const request of [...pendingTutoring.values()]) {
      const helper = request.helper;
      if (hasComponent(ecs, helper, ManuallyControlled) || occupiedBySchool.has(helper) ||
          decisions.some(d => d.actor === helper)) continue;
      if (currentRoom(helper) === null ||
          currentRoom(helper) !== currentRoom(request.requester)) continue;
      const accept = willingToTutor({
        helpful: hasComponent(ecs, helper, Helpful),
        trustsRequester: trustOf(helper, request.requester),
        knowsConcept: spellKnowledge.stage(helper, request.spell) !== 'unaware',
        learnerNeedsConcept: spellKnowledge.stage(request.requester, request.spell) === 'unaware'
      });
      const action: Command = {
        type: 'answer_tutoring', actor: helper, requester: request.requester,
        spell: request.spell, accept
      };
      const result = execute(action);
      decisions.push({ actor: helper, action, result });
      if (result.ok) {
        socialParticipants.add(helper);
        socialParticipants.add(request.requester);
      }
    }

    // A pupil knows their own concrete gap and notices people sharing a room.
    // They do NOT consult the bystander's hidden knowledge or private plans.
    for (const actor of query(ecs, [Character, SeeksHelp])) {
      if (hasComponent(ecs, actor, ManuallyControlled) || occupiedBySchool.has(actor) ||
          socialParticipants.has(actor) || decisions.some(d => d.actor === actor) ||
          pendingTutoring.has(actor) || !hasComponent(ecs, actor, Hearing)) continue;
      const room = currentRoom(actor);
      if (room === null) continue;
      const gaps = knowledgeGaps(actor);
      if (gaps.length === 0) continue;
      const attempted = attemptedTutors.get(actor)!;
      const locals = occupants(room).filter(other =>
        other !== actor && hasComponent(ecs, other, Hearing));
      const ranked = locals.sort((a, b) => {
        const ranks: Record<Trust, number> = { trusted: 2, neutral: 1, distrusted: 0 };
        return ranks[trustOf(actor, b)] - ranks[trustOf(actor, a)] || a - b;
      });
      const candidates = ranked.filter(other =>
        trustOf(actor, other) !== 'distrusted' &&
        !occupiedBySchool.has(other) && !socialParticipants.has(other));
      const target = gaps
        .flatMap(spell => candidates
          .filter(other => !attempted.has(`${other}:${spell}`))
          .map(helper => ({ helper, spell })))
        [0];
      if (!target) continue;
      const action: Command = {
        type: 'ask_tutoring', actor, listener: target.helper, spell: target.spell
      };
      const result = execute(action);
      decisions.push({ actor, action, result });
      if (result.ok) {
        socialParticipants.add(actor);
        socialParticipants.add(target.helper);
      }
    }

    // The decision policy reads only the actor's beliefs and locally visible
    // objects. In particular it never reads authoritative broken-state or events.
    for (const actor of query(ecs, [Character, Inquisitive])) {
      if (hasComponent(ecs, actor, ManuallyControlled) || occupiedBySchool.has(actor) ||
          socialParticipants.has(actor)) continue;
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
      if (hasComponent(ecs, actor, ManuallyControlled) || occupiedBySchool.has(actor) ||
          socialParticipants.has(actor) || decisions.some(d => d.actor === actor)) continue;
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
    // Inquiry-first pupils attend once they have no higher-priority action.
    // Remaining within a lesson's room takes priority over leisure routines.
    for (const actor of query(ecs, [Character, HasTimetable])) {
      if (hasComponent(ecs, actor, ManuallyControlled) || socialParticipants.has(actor) ||
          decisions.some(d => d.actor === actor)) continue;
      const timetable = timetables.get(actor);
      const room = currentRoom(actor);
      if (!timetable || room === null || timetable.priority !== 'inquiry_first') continue;
      const lesson = currentLesson(timetable.records, minute);
      if (!lesson) continue;
      occupiedBySchool.add(actor);
      travelTowardLesson(actor, room, lesson.room);
    }

    // A curious experimenter can apply a genuinely learned pattern.
    // They must previously have performed guided practice; no secret unlock.
    for (const actor of query(ecs, [Character, Experimental])) {
      if (hasComponent(ecs, actor, ManuallyControlled) || occupiedBySchool.has(actor) ||
          socialParticipants.has(actor) || decisions.some(d => d.actor === actor)) continue;
      const ready = spellKnowledge.history(actor)
        .filter(r => r.stage === 'guided')
        .map(r => r.spell)
        .find(spell => spellKnowledge.stage(actor, spell) === 'guided');
      if (ready === undefined) continue;
      const definition = spellDefinitions[ready];
      const action: Command = {
        type: 'practice_spell', actor, spell: ready,
        intent: definition.intent, target: definition.semanticTarget,
        incantation: definition.incantation
      };
      const result = execute(action);
      decisions.push({ actor, action, result });
    }

    // Independent routines produce movement from explicit destination goals.
    // They use the castle's public topology, never hidden character locations.
    for (const actor of query(ecs, [Character, HasRoutine])) {
      if (hasComponent(ecs, actor, ManuallyControlled) || occupiedBySchool.has(actor) ||
          socialParticipants.has(actor) || decisions.some(d => d.actor === actor)) continue;
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
    for (const [actor, timetable] of timetables) {
      // Register arrival before teaching. Being marked present at some point in
      // the lesson is not enough: the pupil must be there at the teaching tick.
      const presentRoom = currentRoom(actor);
      for (const record of registerAttendance(timetable.records, minute, presentRoom)) {
        emit({
          type: 'lesson_attendance', actor, lessonId: record.id,
          status: record.status as 'on_time' | 'late' | 'missed',
          minute
        });
      }
      for (const lesson of timetable.records) {
        if (!lesson.spell || minute !== lesson.startsAt + 10 ||
            presentRoom !== lesson.room || lesson.status === 'pending' ||
            lesson.status === 'missed' ||
            lesson.arrivedAt === undefined || lesson.arrivedAt > minute) continue;
        const learned = spellKnowledge.learn(actor, lesson.spell, 'conceptual',
          { kind: 'lesson', lessonId: lesson.id, minute });
        if (learned) emit({
          type: 'spell_concept_learned', actor, spell: lesson.spell, source: 'lesson', minute
        });
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
    setTimetable, setManualControl, attendance, learningDebt, knowledgeGaps,
    setHelpSeeking, setHelpful, tutoringRequest, assistance, hasHelped,
    seedSpellKnowledge, spellStage, setExperimenter, isIlluminated,
    learningHistory: (actor: EntityId): LearningRecord[] => spellKnowledge.history(actor),
    tick: () => tick,
    clock: () => schoolTime(tick),
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
