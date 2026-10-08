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
import { copyClaim, type Claim, type Belief } from './beliefs.ts';
import { assessReports, type Assessment, type Trust } from './cognition.ts';

import { createRuntimeStores } from './runtime-stores.ts';
import { isHouseId, calculatePoints, respondToNews,
  type HouseId, type PointAuthority, type PointBasis, type PointEvidence,
  type PointDecision, type PointNews, type PointRejection } from './house-points.ts';
import {
  validMeetingTime, hasMeetingConflict,
  type MeetingPurpose, type MeetingCommitment, type CommitmentMemory
} from './social-commitments.ts';
import { runWorldStep, type StepDecision } from './scheduler.ts';
import { INITIAL_NEEDS, afterMeal, isOpenIntention,
  type BodilyNeeds,type PersonalIntention,type IntentionImportance,
  type IntentionStatus,type Interruption } from './intentions.ts';
import type { RuntimeSnapshot, StateFlags } from './runtime-snapshot.ts';
import {
  mealAt, dayOf, localTime, ateMeal,
  type DailyLifePlan, type MealKind, type SocialTopic, type MealMemory,
  type ConversationMemory, type RestMemory
} from './daily-life.ts';
import {
  schoolTime, validateTimetable,
  type Lesson, type AttendanceRecord, type SchoolPriority
} from './school-time.ts';
import {
  spellDefinitions, isSpellId,
  type SpellId, type SpellStage, type LearningRecord
} from './spellcraft.ts';
import {
  copyRequest,
  type TutoringRequest, type AssistanceMemory
} from './social-learning.ts';

export type EntityId = number;
export type RoomDescriptor = {
  floor: number;
  wing?: 'west' | 'east' | 'central';
  kind?: string;
  house?: string;
  /** CANON: explicit book setting; INFERENCE: reconstruction; GAME: fixture. */
  loreStatus?: 'CANON' | 'INFERENCE' | 'GAME';
  loreSource?: string;
};

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
  | { type: 'answer_tutoring'; actor: EntityId; requester: EntityId; spell: SpellId; accept: boolean }
  | { type: 'eat_meal'; actor: EntityId; kind: MealKind }
  | { type: 'chat'; actor: EntityId; listener: EntityId; topic: SocialTopic }
  | { type: 'promise_meeting'; actor: EntityId; listener: EntityId;
      room: EntityId; atMinute: number; purpose: MeetingPurpose }
  | { type: 'offer_meeting'; actor: EntityId; listener: EntityId;
      room: EntityId; atMinute: number; purpose: MeetingPurpose; spell?: SpellId }
  | { type: 'answer_meeting'; actor: EntityId; meetingId: number; accept: boolean }
  | { type: 'tutor_appointment'; actor: EntityId; meetingId: number }
  | { type: 'intend_visit'; actor: EntityId; destination:EntityId;
      importance:IntentionImportance; deadlineMinute?:number }
  | { type: 'cancel_intention'; actor:EntityId; intentionId:number }
  | { type: 'intend_study'; actor:EntityId; spell:SpellId }
  | { type: 'intend_investigate'; actor:EntityId; object:EntityId }
  | {type:'decide_house_points';actor:EntityId;pupil:EntityId;delta:number;
     reason:string;basis:PointBasis}
  | {type:'share_house_points';actor:EntityId;listener:EntityId;decisionId:number};

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
  | { type: 'tutoring_answered'; actor: EntityId; requester: EntityId; spell: SpellId; accepted: boolean; minute: number }
  | { type: 'meal_eaten'; actor: EntityId; kind: MealKind; minute: number }
  | { type: 'conversation_shared'; actor: EntityId; listener: EntityId; topic: SocialTopic; minute: number }
  | { type: 'rest_recorded'; actor: EntityId; minute: number }
  | { type: 'meeting_promised'; actor: EntityId; listener: EntityId;
      meetingId: number; room: EntityId; minute: number }
  | { type: 'meeting_resolved'; actor: EntityId; listener: EntityId;
      meetingId: number; room: EntityId; minute: number; outcome: 'kept' | 'expired' }
  | { type: 'meeting_offered'; actor: EntityId; listener: EntityId;
      meetingId: number; room: EntityId; minute: number }
  | { type: 'meeting_answered'; actor: EntityId; listener: EntityId;
      meetingId: number; room: EntityId; minute: number; accepted: boolean }
  | { type: 'tutoring_appointment_completed'; actor: EntityId; listener: EntityId;
      meetingId: number; room: EntityId; spell: SpellId; minute: number }
  | { type: 'intention_changed'; actor: EntityId; intentionId:number;
      status:IntentionStatus; minute:number; interruptedBy?:Interruption }
  | {type:'house_points_changed';actor:EntityId;pupil:EntityId;house:HouseId;
     decisionId:number;delta:number;reason:string;minute:number}
  | {type:'house_points_shared';actor:EntityId;listener:EntityId;
     decisionId:number;minute:number};

/**
 * What a character is ALLOWED to know.
 *
 * Hearing a crash does NOT carry actor / target IDs or an authoritative event
 * reference. A semantic agent must receive observations(), never events().
 */
export type Observation =
  | { kind: 'witnessed_breakage'; source: 'vision'; actor: EntityId; target: EntityId }
  | { kind: 'heard_crash'; source: 'hearing' }
  | { kind: 'inspected_object'; source: 'vision'; target: EntityId; broken: boolean }
  | {kind:'heard_house_points';source:'hearing'|'testimony';decisionId:number;
      speaker?:EntityId};

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

export type DailyRejection =
  | 'no_daily_plan' | 'wrong_meal_time' | 'not_at_table' | 'already_ate'
  | 'wrong_topic' | 'already_chatted' | 'cannot_chat_to_self'
  | 'not_colocated' | 'listener_cannot_hear';

export type MeetingRejection =
  | 'invalid_partner' | 'invalid_meeting_room' | 'invalid_meeting_time'
  | 'invalid_purpose' | 'already_committed' | 'not_colocated'
  | 'listener_cannot_hear' | 'no_pending_offer' | 'not_invited'
  | 'offer_timed_out' | 'not_study_meeting' | 'appointment_not_ready'
  | 'appointment_already_taught' | 'not_missing_concept';

export type IntentionRejection='no_intention_planner'|'invalid_intention'|
  'too_many_intentions'|'missing_intention'|'invalid_deadline'|'duplicate_intention'|
  'no_personal_knowledge_gap'|'no_local_evidence';

export type CommandResult =
  | { ok: true; events: readonly WorldEvent[] }
  | { ok: false; reason: MoveRejection | BreakRejection | SocialRejection | DoorRejection | InspectRejection | QuestionRejection | SpellRejection | HelpRejection | DailyRejection | MeetingRejection | IntentionRejection | PointRejection; events: readonly [] };

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
  const HasDailyLife = {};
  const HelpedBy = createRelation();
  const Trusts = createRelation();
  const Distrusts = createRelation();
  const Name = { value: [] as string[] };
  const LocatedIn = createRelation({ exclusive: true });
  const PassageTo = createRelation();

  const {
    keys, doors, events, observationsByCharacter, beliefsByCharacter, roomDetails,
    spellKnowledge, pendingTutoring, attemptedTutors, assistanceHistory,
    searches, routines, timetables, dailyPlans, meals, conversations, rests,
    commitments, commitmentMemories, intentions, bodilyNeeds,
    houseMembership, pointAuthorities, pointLedger, pointNews
  } = createRuntimeStores();
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

  function room(key: string, label: string, descriptor?: RoomDescriptor): EntityId {
    if (descriptor && (!Number.isSafeInteger(descriptor.floor) ||
        (descriptor.wing !== undefined &&
         !['west','east','central'].includes(descriptor.wing)))) {
      throw new Error('Invalid room floor/wing descriptor');
    }
    const eid = addNamedEntity(key, label);
    addComponent(ecs, eid, Room);
    if (descriptor) roomDetails.set(eid, { ...descriptor });
    return eid;
  }

  /** World-owned spatial metadata, not an NPC's discovered map. */
  function roomInfo(id: EntityId): RoomDescriptor | null {
    const info = roomDetails.get(id);
    return info ? { ...info } : null;
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
    meals.set(eid, []);
    conversations.set(eid, []);
    rests.set(eid, []);
    commitmentMemories.set(eid, []);
    intentions.set(eid, []);
    pointNews.set(eid, []);
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

  /** Explicit institutional roles; a staff member is not enrolled as a pupil. */
  function registerHouse(actor:EntityId,house:HouseId):void{
    if(!isCharacter(actor)||!isHouseId(house)||pointAuthorities.has(actor))
      throw new Error('Invalid house enrollment');
    houseMembership.set(actor,house);
  }
  function grantPointAuthority(actor:EntityId,role:PointAuthority):void{
    if(!isCharacter(actor)||houseMembership.has(actor)||
       (role!=='teacher'&&role!=='headmaster'))
      throw new Error('Invalid staff point authority');
    pointAuthorities.set(actor,role);
  }
  function houseOf(actor:EntityId):HouseId|null{return houseMembership.get(actor)??null;}
  function housePoints(){return calculatePoints(pointLedger);}
  function pointHistory():PointDecision[]{
    return pointLedger.map(d=>({...d,evidence:{...d.evidence}}));
  }
  function knownPointNews(actor:EntityId):PointNews[]{
    return (pointNews.get(actor)??[]).map(n=>({...n}));
  }
  function pointReactions(actor:EntityId){
    return knownPointNews(actor).flatMap(news=>{
      const response=respondToNews(actor,houseMembership.get(actor),news);
      return response?[response]:[];
    });
  }
  function learnPointNews(actor:EntityId,decision:PointDecision,
    source:'hearing'|'testimony',speaker?:EntityId):void{
    const ledger=pointNews.get(actor);
    if(!ledger||ledger.some(n=>n.decisionId===decision.id))return;
    ledger.push({decisionId:decision.id,minute:schoolTime(tick).absoluteMinute,
      announcer:decision.actor,pupil:decision.pupil,house:decision.house,
      delta:decision.delta,reason:decision.reason,source,
      ...(speaker===undefined?{}:{speaker})});
    observationsByCharacter.get(actor)?.push({kind:'heard_house_points',source,
      decisionId:decision.id,...(speaker===undefined?{}:{speaker})});
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

  function setDailyLife(actor: EntityId, plan: DailyLifePlan | null): void {
    if (!isCharacter(actor)) throw new Error('Daily life requires a character');
    if (plan === null) {
      bodilyNeeds.delete(actor);
      dailyPlans.delete(actor);
      removeComponent(ecs, actor, HasDailyLife);
      return;
    }
    if (!isRoom(plan.homeRoom) || !isRoom(plan.diningRoom) ||
        (plan.socialRoom !== undefined && !isRoom(plan.socialRoom)) ||
        (plan.leisureRoom !== undefined && !isRoom(plan.leisureRoom)) ||
        (plan.intentionPlanning !== undefined &&
          typeof plan.intentionPlanning !== 'boolean') ||
        (plan.learningAppointments !== undefined &&
          typeof plan.learningAppointments !== 'boolean') ||
        (plan.socialInvitations !== undefined &&
          typeof plan.socialInvitations !== 'boolean') ||
        (plan.commitmentPriority !== undefined &&
          !['school_first','promise_first'].includes(plan.commitmentPriority)) ||
        !['outgoing', 'reserved'].includes(plan.style) ||
        !['lessons', 'castle', 'hobbies'].includes(plan.interest)) {
      throw new Error('Invalid daily-life configuration');
    }
    dailyPlans.set(actor, { ...plan });
    if(plan.intentionPlanning===true && !bodilyNeeds.has(actor))
      bodilyNeeds.set(actor,{...INITIAL_NEEDS});
    else if(plan.intentionPlanning!==true)bodilyNeeds.delete(actor);
    addComponent(ecs, actor, HasDailyLife);
  }

  function queueIntention(actor:EntityId,
    details:Pick<PersonalIntention,'kind'|'destination'|'importance'> &
      Partial<Pick<PersonalIntention,'spell'|'meetingId'|'object'|'deadlineMinute'>>
  ):PersonalIntention|null{
    if(!dailyPlans.get(actor)?.intentionPlanning)return null;
    const personal=intentions.get(actor)!;
    const duplicate=personal.find(g=>isOpenIntention(g)&&g.kind===details.kind &&
      (details.kind==='learn_concept'?g.spell===details.spell:
       details.kind==='attend_meeting'?g.meetingId===details.meetingId:
       details.kind==='investigate'?g.object===details.object:
       g.destination===details.destination));
    if(duplicate)return duplicate;
    if(personal.filter(isOpenIntention).length>=8)return null;
    const goal:PersonalIntention={
      ...details,id:(personal.at(-1)?.id??0)+1,
      createdMinute:schoolTime(tick).absoluteMinute,status:'queued'
    };
    personal.push(goal);
    emit({type:'intention_changed',actor,intentionId:goal.id,status:'queued',
      minute:schoolTime(tick).absoluteMinute});
    return goal;
  }
  function queueMeetingIntents(meeting:MeetingCommitment,accepted=true):void{
    // A unilateral declaration cannot conscript a non-consenting listener.
    for(const actor of accepted
      ? [meeting.promisor,meeting.beneficiary]:[meeting.promisor]){
      queueIntention(actor,{
        kind:'attend_meeting',destination:meeting.room,
        importance:'important',meetingId:meeting.id,
        deadlineMinute:meeting.atMinute+20
      });
    }
  }

  function intentionHistory(actor:EntityId):PersonalIntention[]{
    return (intentions.get(actor)??[]).map(goal=>({...goal}));
  }
  function needsOf(actor:EntityId):BodilyNeeds|null{
    const v=bodilyNeeds.get(actor);return v?{...v}:null;
  }
  function transitionIntention(
    actor:EntityId,goalId:number,status:IntentionStatus,
    interruptedBy?:Interruption
  ):void {
    const goal=intentions.get(actor)?.find(g=>g.id===goalId);
    if(!goal || (goal.status===status && goal.interruptedBy===interruptedBy))return;
    goal.status=status;
    if(interruptedBy!==undefined)goal.interruptedBy=interruptedBy;
    else delete goal.interruptedBy;
    emit({type:'intention_changed',actor,intentionId:goalId,status,
      minute:schoolTime(tick).absoluteMinute,
      ...(interruptedBy===undefined?{}:{interruptedBy})});
  }

  function mealHistory(actor: EntityId): MealMemory[] {
    return (meals.get(actor) ?? []).map(m => ({ ...m }));
  }
  function conversationHistory(actor: EntityId): ConversationMemory[] {
    return (conversations.get(actor) ?? []).map(m => ({ ...m }));
  }
  function restHistory(actor: EntityId): RestMemory[] {
    return (rests.get(actor) ?? []).map(m => ({ ...m }));
  }
  /** Subjective evidence only: an absent person doesn't hear about a missed visit. */
  function promiseHistory(actor: EntityId): CommitmentMemory[] {
    return (commitmentMemories.get(actor) ?? []).map(m => ({ ...m }));
  }
  /** World-level diagnostics, never exposed as omniscient input to NPC beliefs. */
  function meetingLedger(): MeetingCommitment[] {
    return commitments.map(m => ({ ...m }));
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
    if(event.type==='house_points_changed'){
      const decision=pointLedger.find(d=>d.id===event.decisionId);
      const room=currentRoom(event.actor);
      if(decision&&room!==null)for(const listener of query(ecs,[Character]))
        if(currentRoom(listener)===room&&hasComponent(ecs,listener,Hearing))
          learnPointNews(listener,decision,'hearing');
      return;
    }
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
    if(command.type==='decide_house_points'){
      if(!pointAuthorities.has(command.actor))
        return {ok:false,reason:'no_point_authority',events:[]};
      const house=houseMembership.get(command.pupil);
      if(!isCharacter(command.pupil)||!house)
        return {ok:false,reason:'not_enrolled',events:[]};
      if(!Number.isSafeInteger(command.delta)||command.delta===0||
        Math.abs(command.delta)>50)
        return {ok:false,reason:'invalid_points',events:[]};
      if(typeof command.reason!=='string'||command.reason.trim().length<3||
        command.reason.length>240)
        return {ok:false,reason:'invalid_reason',events:[]};
      let evidence:PointEvidence;
      if(command.delta<0){
        if(command.basis?.kind!=='breakage_claim')
          return {ok:false,reason:'wrong_basis',events:[]};
        const object=command.basis.object;
        const belief=beliefsByCharacter.read(command.actor).find(b=>
          b.claim.kind==='broke_object'&&b.claim.culprit===command.pupil&&
          b.claim.object===object);
        if(!belief)return {ok:false,reason:'missing_evidence',events:[]};
        evidence=belief.evidence.kind==='vision'
          ?{kind:'vision',object}
          :{kind:'testimony',object,speaker:belief.evidence.speaker};
      }else{
        if(command.basis?.kind!=='observed_merit')
          return {ok:false,reason:'wrong_basis',events:[]};
        if(currentRoom(command.actor)!==currentRoom(command.pupil)||
          !hasComponent(ecs,command.actor,Vision))
          return {ok:false,reason:'missing_evidence',events:[]};
        evidence={kind:'direct_merit'};
      }
      if(pointLedger.some(d=>d.actor===command.actor&&d.pupil===command.pupil&&
        d.delta===command.delta&&d.reason===command.reason.trim()&&
        d.evidence.kind===evidence.kind&&
        ('object' in d.evidence?d.evidence.object:undefined)===
        ('object' in evidence?evidence.object:undefined)))
        return {ok:false,reason:'duplicate_decision',events:[]};
      const minute=schoolTime(tick).absoluteMinute;
      const decision:PointDecision={id:pointLedger.length+1,minute,
        actor:command.actor,pupil:command.pupil,house,delta:command.delta,
        reason:command.reason.trim(),evidence};
      pointLedger.push(decision);
      const event:WorldEvent={type:'house_points_changed',actor:command.actor,
        pupil:command.pupil,house,delta:decision.delta,reason:decision.reason,
        decisionId:decision.id,minute};
      emit(event);
      return {ok:true,events:[event]};
    }
    if(command.type==='share_house_points'){
      if(!isCharacter(command.listener)||command.actor===command.listener)
        return {ok:false,reason:'cannot_talk_to_self',events:[]};
      if(currentRoom(command.actor)===null||
        currentRoom(command.actor)!==currentRoom(command.listener))
        return {ok:false,reason:'not_colocated',events:[]};
      if(!hasComponent(ecs,command.actor,Hearing)||
        !hasComponent(ecs,command.listener,Hearing))
        return {ok:false,reason:'listener_cannot_hear',events:[]};
      const decision=pointLedger.find(d=>d.id===command.decisionId);
      if(!decision)return {ok:false,reason:'unknown_decision',events:[]};
      if(!pointNews.get(command.actor)?.some(n=>n.decisionId===decision.id))
        return {ok:false,reason:'news_not_known',events:[]};
      if(pointNews.get(command.listener)?.some(n=>n.decisionId===decision.id))
        return {ok:false,reason:'already_knows',events:[]};
      learnPointNews(command.listener,decision,'testimony',command.actor);
      const event:WorldEvent={type:'house_points_shared',actor:command.actor,
        listener:command.listener,decisionId:decision.id,
        minute:schoolTime(tick).absoluteMinute};
      emit(event);
      return {ok:true,events:[event]};
    }
    if (command.type === 'offer_meeting') {
      if (!isCharacter(command.listener) || command.listener === command.actor)
        return {ok:false,reason:'invalid_partner',events:[]};
      if (!isRoom(command.room))
        return {ok:false,reason:'invalid_meeting_room',events:[]};
      if (!['study','explore'].includes(command.purpose))
        return {ok:false,reason:'invalid_purpose',events:[]};
      if(command.spell !== undefined && (
        command.purpose!=='study' || !isSpellId(command.spell) ||
        !knowledgeGaps(command.actor).includes(command.spell)))
        return {ok:false,reason:'not_missing_concept',events:[]};
      const now=schoolTime(tick).absoluteMinute;
      if (!validMeetingTime(now,command.atMinute))
        return {ok:false,reason:'invalid_meeting_time',events:[]};
      if (currentRoom(command.actor)===null ||
          currentRoom(command.actor)!==currentRoom(command.listener))
        return {ok:false,reason:'not_colocated',events:[]};
      if (!hasComponent(ecs,command.actor,Hearing) ||
          !hasComponent(ecs,command.listener,Hearing))
        return {ok:false,reason:'listener_cannot_hear',events:[]};
      if (hasMeetingConflict(commitments,command.actor,command.listener,command.atMinute))
        return {ok:false,reason:'already_committed',events:[]};
      const offer:MeetingCommitment={
        id:commitments.length+1,promisor:command.actor,
        beneficiary:command.listener,room:command.room,
        atMinute:command.atMinute,purpose:command.purpose,
        ...(command.spell===undefined?{}:{spell:command.spell}),status:'offered'
      };
      commitments.push(offer);
      if(offer.spell!==undefined)
        attemptedTutors.get(command.actor)!.add(`${command.listener}:${offer.spell}`);
      commitmentMemories.get(command.actor)!.push({
        meetingId:offer.id,partner:command.listener,kind:'offered',
        minute:now,room:offer.room,purpose:offer.purpose,
        ...(offer.spell===undefined?{}:{spell:offer.spell})
      });
      commitmentMemories.get(command.listener)!.push({
        meetingId:offer.id,partner:command.actor,kind:'invited',
        minute:now,room:offer.room,purpose:offer.purpose,
        ...(offer.spell===undefined?{}:{spell:offer.spell})
      });
      const event:WorldEvent={
        type:'meeting_offered',actor:command.actor,listener:command.listener,
        meetingId:offer.id,room:offer.room,minute:now
      };
      emit(event);
      return {ok:true,events:[event]};
    }
    if (command.type === 'answer_meeting') {
      const offer=commitments.find(m=>m.id===command.meetingId);
      if(!offer || offer.status!=='offered')
        return {ok:false,reason:'no_pending_offer',events:[]};
      if(offer.beneficiary!==command.actor)
        return {ok:false,reason:'not_invited',events:[]};
      const now=schoolTime(tick).absoluteMinute;
      if(now>=offer.atMinute-20)
        return {ok:false,reason:'offer_timed_out',events:[]};
      if(currentRoom(command.actor)===null ||
          currentRoom(command.actor)!==currentRoom(offer.promisor))
        return {ok:false,reason:'not_colocated',events:[]};
      if(!hasComponent(ecs,command.actor,Hearing) ||
         !hasComponent(ecs,offer.promisor,Hearing))
        return {ok:false,reason:'listener_cannot_hear',events:[]};
      if(command.accept && hasMeetingConflict(
          commitments.filter(x=>x.id!==offer.id),
          offer.promisor,offer.beneficiary,offer.atMinute))
        return {ok:false,reason:'already_committed',events:[]};
      offer.status=command.accept?'pending':'declined';
      const kind=command.accept?'accepted':'declined';
      const participants: readonly (readonly [EntityId,EntityId])[]=[
        [offer.promisor,offer.beneficiary],
        [offer.beneficiary,offer.promisor]
      ];
      for(const [who,partner] of participants){
        commitmentMemories.get(who)!.push({
          meetingId:offer.id,partner,kind,minute:now,
          room:offer.room,purpose:offer.purpose,
          ...(offer.spell===undefined?{}:{spell:offer.spell})
        });
      }
      const event:WorldEvent={
        type:'meeting_answered',actor:command.actor,listener:offer.promisor,
        meetingId:offer.id,room:offer.room,minute:now,
        accepted:command.accept
      };
      emit(event);
      if(command.accept)queueMeetingIntents(offer);
      return {ok:true,events:[event]};
    }
    if(command.type==='tutor_appointment'){
      const meeting=commitments.find(m=>m.id===command.meetingId);
      if(!meeting || meeting.status!=='pending' || !meeting.spell)
        return {ok:false,reason:'not_study_meeting',events:[]};
      if(meeting.beneficiary!==command.actor)
        return {ok:false,reason:'not_invited',events:[]};
      if(meeting.taught)
        return {ok:false,reason:'appointment_already_taught',events:[]};
      const minute=schoolTime(tick).absoluteMinute;
      if(minute<meeting.atMinute || minute>=meeting.atMinute+20 ||
         currentRoom(meeting.promisor)!==meeting.room ||
         currentRoom(meeting.beneficiary)!==meeting.room)
        return {ok:false,reason:'appointment_not_ready',events:[]};
      // Canonical teaching guard verifies actual teacher knowledge,
      // learner's gap, both characters' hearing and physical co-location.
      const taught=execute({type:'tutor_spell',actor:command.actor,
        listener:meeting.promisor,spell:meeting.spell});
      if(!taught.ok) return taught;
      meeting.taught=true;
      addComponent(ecs,meeting.promisor,HelpedBy(meeting.beneficiary));
      assistanceHistory.get(meeting.promisor)!.push({
        helper:meeting.beneficiary,spell:meeting.spell,minute
      });
      const event:WorldEvent={type:'tutoring_appointment_completed',
        actor:meeting.beneficiary,listener:meeting.promisor,
        meetingId:meeting.id,room:meeting.room,spell:meeting.spell,minute};
      emit(event);
      return {ok:true,events:[...taught.events,event]};
    }
    if (command.type === 'promise_meeting') {
      if (!isCharacter(command.listener) || command.listener === command.actor) {
        return {ok:false,reason:'invalid_partner',events:[]};
      }
      if (!isRoom(command.room)) return {ok:false,reason:'invalid_meeting_room',events:[]};
      if (!['study','explore'].includes(command.purpose)) {
        return {ok:false,reason:'invalid_purpose',events:[]};
      }
      const now=schoolTime(tick).absoluteMinute;
      if (!validMeetingTime(now,command.atMinute)) {
        return {ok:false,reason:'invalid_meeting_time',events:[]};
      }
      if (currentRoom(command.actor) === null ||
          currentRoom(command.actor) !== currentRoom(command.listener)) {
        return {ok:false,reason:'not_colocated',events:[]};
      }
      if (!hasComponent(ecs,command.actor,Hearing) ||
          !hasComponent(ecs,command.listener,Hearing)) {
        return {ok:false,reason:'listener_cannot_hear',events:[]};
      }
      if (hasMeetingConflict(commitments,command.actor,command.listener,command.atMinute)) {
        return {ok:false,reason:'already_committed',events:[]};
      }
      const meeting:MeetingCommitment={
        id:commitments.length+1, promisor:command.actor,
        beneficiary:command.listener, room:command.room,
        atMinute:command.atMinute, purpose:command.purpose,
        status:'pending'
      };
      commitments.push(meeting);
      commitmentMemories.get(command.actor)!.push({
        meetingId:meeting.id,partner:command.listener,kind:'promised',
        minute:now,room:meeting.room,purpose:meeting.purpose
      });
      commitmentMemories.get(command.listener)!.push({
        meetingId:meeting.id,partner:command.actor,kind:'heard_promise',
        minute:now,room:meeting.room,purpose:meeting.purpose
      });
      const event:WorldEvent={
        type:'meeting_promised',actor:command.actor,listener:command.listener,
        meetingId:meeting.id,room:meeting.room,minute:now
      };
      emit(event);
      queueMeetingIntents(meeting,false);
      return {ok:true,events:[event]};
    }
    if(command.type==='intend_study'){
      if(!isCharacter(command.actor) || !dailyPlans.get(command.actor)?.intentionPlanning)
        return {ok:false,reason:'no_intention_planner',events:[]};
      if(!isSpellId(command.spell)||
         !knowledgeGaps(command.actor).includes(command.spell))
        return {ok:false,reason:'no_personal_knowledge_gap',events:[]};
      const existing=intentions.get(command.actor)!.find(g=>
        isOpenIntention(g)&&g.kind==='learn_concept'&&g.spell===command.spell);
      if(existing)return {ok:false,reason:'duplicate_intention',events:[]};
      const goal=queueIntention(command.actor,{
        kind:'learn_concept',destination:currentRoom(command.actor)!,
        importance:'important',spell:command.spell
      });
      if(!goal)return {ok:false,reason:'too_many_intentions',events:[]};
      return {ok:true,events:[copyEvent(events.at(-1)!)]};
    }
    if(command.type==='intend_investigate'){
      if(!isCharacter(command.actor) || !dailyPlans.get(command.actor)?.intentionPlanning)
        return {ok:false,reason:'no_intention_planner',events:[]};
      const room=currentRoom(command.actor);
      const known=beliefsByCharacter.read(command.actor).some(
        b=>b.claim.object===command.object);
      if(room===null || !known || !hasComponent(ecs,command.actor,Vision) ||
         !hasComponent(ecs,command.object,Fragile) ||
         locationOf(command.object)!==room ||
         observations(command.actor).some(
           o=>o.kind==='inspected_object'&&o.target===command.object))
        return {ok:false,reason:'no_local_evidence',events:[]};
      if(intentions.get(command.actor)!.some(g=>
        isOpenIntention(g)&&g.kind==='investigate'&&g.object===command.object))
        return {ok:false,reason:'duplicate_intention',events:[]};
      const goal=queueIntention(command.actor,{
        kind:'investigate',destination:room,importance:'casual',
        object:command.object
      });
      if(!goal)return {ok:false,reason:'too_many_intentions',events:[]};
      return {ok:true,events:[copyEvent(events.at(-1)!)]};
    }
    if(command.type==='intend_visit'){
      if(!isCharacter(command.actor)||!dailyPlans.get(command.actor)?.intentionPlanning)
        return {ok:false,reason:'no_intention_planner',events:[]};
      if(!isRoom(command.destination)||!['casual','important'].includes(command.importance))
        return {ok:false,reason:'invalid_intention',events:[]};
      const now=schoolTime(tick).absoluteMinute;
      if(command.deadlineMinute!==undefined&&(
        !Number.isSafeInteger(command.deadlineMinute) ||
        command.deadlineMinute<now+10 ||
        command.deadlineMinute>now+7*1440))
        return {ok:false,reason:'invalid_deadline',events:[]};
      const personal=intentions.get(command.actor)!;
      if(personal.some(g=>isOpenIntention(g)&&g.destination===command.destination))
        return {ok:false,reason:'duplicate_intention',events:[]};
      if(personal.filter(isOpenIntention).length>=8)
        return {ok:false,reason:'too_many_intentions',events:[]};
      const id=(personal.at(-1)?.id??0)+1;
      personal.push({id,kind:'visit',destination:command.destination,
        importance:command.importance,createdMinute:now,
        ...(command.deadlineMinute===undefined?{}:{deadlineMinute:command.deadlineMinute}),
        status:'queued'});
      const event:WorldEvent={type:'intention_changed',actor:command.actor,
        intentionId:id,status:'queued',minute:now};
      emit(event);return {ok:true,events:[event]};
    }
    if(command.type==='cancel_intention'){
      if(!isCharacter(command.actor))
        return {ok:false,reason:'no_intention_planner',events:[]};
      const goal=intentions.get(command.actor)?.find(
        g=>g.id===command.intentionId && isOpenIntention(g));
      if(!goal)return {ok:false,reason:'missing_intention',events:[]};
      transitionIntention(command.actor,goal.id,'cancelled');
      const event=events.at(-1)!;
      return {ok:true,events:[copyEvent(event)]};
    }

    if (command.type === 'eat_meal') {
      const plan = dailyPlans.get(command.actor);
      if (!plan) return { ok: false, reason: 'no_daily_plan', events: [] };
      const minute = schoolTime(tick).absoluteMinute;
      if (mealAt(minute) !== command.kind) {
        return { ok: false, reason: 'wrong_meal_time', events: [] };
      }
      if (currentRoom(command.actor) !== plan.diningRoom) {
        return { ok: false, reason: 'not_at_table', events: [] };
      }
      const personal = meals.get(command.actor)!;
      if (ateMeal(personal, dayOf(minute), command.kind)) {
        return { ok: false, reason: 'already_ate', events: [] };
      }
      personal.push({ day: dayOf(minute), kind: command.kind, minute });
      const previous=bodilyNeeds.get(command.actor);
      if(previous)bodilyNeeds.set(command.actor,afterMeal(previous));
      const event: WorldEvent = { type: 'meal_eaten', actor: command.actor, kind: command.kind, minute };
      emit(event);
      return { ok: true, events: [event] };
    }

    if (command.type === 'chat') {
      if (!isCharacter(command.listener) || command.actor === command.listener) {
        return { ok: false, reason: 'cannot_chat_to_self', events: [] };
      }
      if (!['lessons', 'castle', 'hobbies'].includes(command.topic)) {
        return { ok: false, reason: 'wrong_topic', events: [] };
      }
      const a = currentRoom(command.actor);
      if (a === null || a !== currentRoom(command.listener)) {
        return { ok: false, reason: 'not_colocated', events: [] };
      }
      if (!hasComponent(ecs, command.actor, Hearing) ||
          !hasComponent(ecs, command.listener, Hearing)) {
        return { ok: false, reason: 'listener_cannot_hear', events: [] };
      }
      const minute = schoolTime(tick).absoluteMinute;
      const day = dayOf(minute);
      const actorMemories = conversations.get(command.actor)!;
      const listenerMemories = conversations.get(command.listener)!;
      // Social interactions require one session per participant per day.
      if (actorMemories.some(m => dayOf(m.minute) === day) ||
          listenerMemories.some(m => dayOf(m.minute) === day)) {
        return { ok: false, reason: 'already_chatted', events: [] };
      }
      actorMemories.push({ partner: command.listener, topic: command.topic, minute });
      listenerMemories.push({ partner: command.actor, topic: command.topic, minute });
      const event: WorldEvent = {
        type: 'conversation_shared', actor: command.actor,
        listener: command.listener, topic: command.topic, minute
      };
      emit(event);
      // Ordinary conversations pass one known incident, not a global log.
      const learnedByActor=[...(pointNews.get(command.actor)??[])].reverse()
        .find(n=>!pointNews.get(command.listener)?.some(x=>x.decisionId===n.decisionId));
      const learnedByListener=[...(pointNews.get(command.listener)??[])].reverse()
        .find(n=>!pointNews.get(command.actor)?.some(x=>x.decisionId===n.decisionId));
      const speaker=learnedByActor?command.actor:learnedByListener?command.listener:null;
      const listener=learnedByActor?command.listener:learnedByListener?command.actor:null;
      const known=learnedByActor??learnedByListener;
      if(speaker!==null&&listener!==null&&known){
        const decision=pointLedger.find(d=>d.id===known.decisionId);
        if(decision){
          learnPointNews(listener,decision,'testimony',speaker);
          const rumor:WorldEvent={type:'house_points_shared',actor:speaker,
            listener,decisionId:decision.id,minute};
          emit(rumor);
          return {ok:true,events:[event,rumor]};
        }
      }
      return { ok: true, events: [event] };
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
      for(const goal of intentions.get(command.actor)??[])
        if(isOpenIntention(goal)&&goal.kind==='investigate'&&goal.object===command.target)
          transitionIntention(command.actor,goal.id,'completed');
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

  function resolveMeetings(minute: number): void {
    for (const meeting of commitments) {
      if(meeting.status==='offered' && minute>=meeting.atMinute-20){
        // Unanswered invitations are not social betrayals.
        meeting.status='unanswered';
        continue;
      }
      if (meeting.status !== 'pending' || minute < meeting.atMinute) continue;
      const promisorHere=currentRoom(meeting.promisor)===meeting.room;
      const beneficiaryHere=currentRoom(meeting.beneficiary)===meeting.room;
      const kept=promisorHere && beneficiaryHere;
      if (!kept && minute<meeting.atMinute+20) continue;
      meeting.status=kept?'kept':'expired';
      const remember=(who:number,partner:number,kind:CommitmentMemory['kind'])=>{
        commitmentMemories.get(who)!.push({
          meetingId:meeting.id,partner,kind,minute,room:meeting.room,
          purpose:meeting.purpose,
          ...(meeting.spell===undefined?{}:{spell:meeting.spell})
        });
      };
      if(kept) {
        remember(meeting.promisor,meeting.beneficiary,'met');
        remember(meeting.beneficiary,meeting.promisor,'met');
      } else {
        // Only a *physically waiting* participant can remember abandonment.
        if(promisorHere) remember(meeting.promisor,meeting.beneficiary,'waited_alone');
        if(beneficiaryHere) remember(meeting.beneficiary,meeting.promisor,'waited_alone');
      }
      emit({type:'meeting_resolved',actor:meeting.promisor,
        listener:meeting.beneficiary,meetingId:meeting.id,
        room:meeting.room,minute,outcome:meeting.status});
      for(const actor of [meeting.promisor,meeting.beneficiary])
        for(const goal of intentions.get(actor)??[])
          if(isOpenIntention(goal)&&goal.kind==='attend_meeting' &&
             goal.meetingId===meeting.id)
            transitionIntention(actor,goal.id,kept?'completed':'expired');
    }
  }

  function recordDailyRest(minute: number): void {
    if (localTime(minute) < 1320) return;
    const day = dayOf(minute);
    for (const [actor, plan] of dailyPlans) {
      if (currentRoom(actor) !== plan.homeRoom) continue;
      const history = rests.get(actor)!;
      if (history.some(r => r.day === day)) continue;
      history.push({ day, minute });
      emit({ type: 'rest_recorded', actor, minute });
    }
  }

  function step(): StepDecision[] {
    const flags = {
      manual: ManuallyControlled, vision: Vision, hearing: Hearing, helpful: Helpful
    };
    const agentComponents = {
      timetable: HasTimetable, seeksHelp: SeeksHelp, inquisitive: Inquisitive,
      socialInvestigator: SociableInvestigator, experimental: Experimental,
      routine: HasRoutine, dailyLife: HasDailyLife
    };
    return runWorldStep({
      advanceClock: () => schoolTime(++tick).absoluteMinute,
      actors: trait => Array.from(query(ecs, [Character, agentComponents[trait]])),
      has: (actor, flag) => hasComponent(ecs, actor, flags[flag]),
      visibleFragiles: room => Array.from(query(ecs, [Fragile, LocatedIn(room)])),
      passageAction: (actor, room, next) => {
        const door = doors.get(pairKey(room, next));
        return door !== undefined && Door.open[door] === 0
          ? { type: 'open_door', actor, door }
          : { type: 'move', actor, destination: next };
      },
      exits: room => getRelationTargets(ecs, room, PassageTo),
      execute, currentRoom, occupants, observations, assessment, trustOf, knowledgeGaps,
      pendingTutoring, attemptedTutors, searches, timetables, routines,
      dailyPlans, meals, conversations, rests,
      commitments, commitmentMemories, intentions, bodilyNeeds,
      transitionIntention,
      resolveMeetings,
      spellKnowledge, beliefsByCharacter, setRoutine, emit,
      recordDailyRest
    });
  }

  function occupants(place: EntityId): EntityId[] {
    if (!isRoom(place)) return [];
    return Array.from(query(ecs, [Character, LocatedIn(place)]));
  }

  function observations(observer: EntityId): Observation[] {
    const ledger = observationsByCharacter.get(observer);
    return ledger ? ledger.map(record => ({ ...record })) : [];
  }

  /**
   * Authoritative materialization boundary. Never pass this object to NPCs.
   * It includes the actual pending decisions, cognition and interaction memory.
   */
  function intentionEntries():[number,PersonalIntention[]][] {
    return [...intentions.entries()].filter(([,goals])=>goals.length>0)
      .map(([actor,goals]):[number,PersonalIntention[]]=>[
        actor,goals.map(g=>({...g}))
      ]);
  }
  function captureRuntime(): RuntimeSnapshot {
    const characters = Array.from(query(ecs, [Character]));
    const traitFlags = (actor: EntityId): StateFlags => ({
      vision: hasComponent(ecs, actor, Vision),
      hearing: hasComponent(ecs, actor, Hearing),
      inquisitive: hasComponent(ecs, actor, Inquisitive),
      socialInvestigator: hasComponent(ecs, actor, SociableInvestigator),
      guarded: hasComponent(ecs, actor, Guarded),
      hasRoutine: hasComponent(ecs, actor, HasRoutine),
      hasTimetable: hasComponent(ecs, actor, HasTimetable),
      hasDailyLife: hasComponent(ecs, actor, HasDailyLife),
      manuallyControlled: hasComponent(ecs, actor, ManuallyControlled),
      experimental: hasComponent(ecs, actor, Experimental),
      illuminated: hasComponent(ecs, actor, Illuminated),
      seeksHelp: hasComponent(ecs, actor, SeeksHelp),
      helpful: hasComponent(ecs, actor, Helpful)
    });
    const trust: [number, number, Trust][] = [];
    const helped: [number, number][] = [];
    for (const receiver of characters) {
      for (const other of characters) {
        if (receiver === other) continue;
        const relation = trustOf(receiver, other);
        if (relation !== 'neutral') trust.push([receiver, other, relation]);
        if (hasComponent(ecs, receiver, HelpedBy(other))) helped.push([receiver, other]);
      }
    }
    const state: RuntimeSnapshot = {
      tick,
      entityKeys: [...keys.entries()],
      ...(roomDetails.size
        ? { roomDetails: [...roomDetails.entries()].map(([id, details]) =>
            [id, { ...details }] as [number, RoomDescriptor]) }
        : {}),
      locations: [...keys.values()].flatMap(id => {
        const room = locationOf(id);
        return room === null ? [] : [[id, room] as [number, number]];
      }),
      broken: Array.from(query(ecs, [Fragile])).map(id => [id, Fragile.broken[id] === 1]),
      doors: Array.from(query(ecs, [Door])).map(id => [id, Door.open[id] === 1]),
      flags: characters.map(id => [id, traitFlags(id)]),
      trusts: trust,
      helpedBy: helped,
      observations: [...observationsByCharacter.entries()],
      beliefs: characters.map(id => [id, beliefsByCharacter.read(id)]),
      learning: characters.map(id => [id, spellKnowledge.history(id)]),
      schedules: [...timetables.entries()],
      dailyPlans: [...dailyPlans.entries()],
      meals: [...meals.entries()],
      conversations: [...conversations.entries()],
      rests: [...rests.entries()],
      ...(intentionEntries().length?{intentions:intentionEntries()}:{} ),
      ...(bodilyNeeds.size?{bodilyNeeds:[...bodilyNeeds.entries()]
        .map(([actor,needs])=>[actor,{...needs}] as [number,BodilyNeeds])}:{}),
      ...(commitments.length ? { commitments: commitments.map(m=>({...m})) } : {}),
      ...([...commitmentMemories.values()].some(items=>items.length)
        ? { commitmentMemories: [...commitmentMemories.entries()]
            .filter(([,items])=>items.length)
            .map(([id,items])=>[id,items.map(m=>({...m}))] as [number,CommitmentMemory[]]) }
        : {}),
      routines: [...routines.entries()],
      searches: [...searches.entries()].map(([id, value]) => [id, {
        object: value.object, asked: [...value.asked], seenRooms: [...value.seenRooms], trail: [...value.trail]
      }]),
      requests: [...pendingTutoring.entries()],
      attemptedTutors: [...attemptedTutors.entries()].map(([id, values]) => [id, [...values]]),
      assistance: [...assistanceHistory.entries()],
      ...(houseMembership.size?{houseMembership:[...houseMembership.entries()]}:{}),
      ...(pointAuthorities.size?{pointAuthorities:[...pointAuthorities.entries()]}:{}),
      ...(pointLedger.length?{pointLedger:pointHistory()}:{}),
      ...([...pointNews.values()].some(items=>items.length)?{
        pointNews:[...pointNews.entries()].filter(([,news])=>news.length)
          .map(([id,news])=>[id,news.map(n=>({...n}))] as [number,PointNews[]])
      }:{}),
      events: events.map(copyEvent)
    };
    return JSON.parse(JSON.stringify(state)) as RuntimeSnapshot;
  }

  /**
   * Internal checkpoint hydration: call only after recreating the *static*
   * entity graph. State references must be pre-remapped to this ECS world.
   */
  function hydrateRuntime(input: RuntimeSnapshot): void {
    const state = JSON.parse(JSON.stringify(input)) as RuntimeSnapshot;
    if (!Number.isSafeInteger(state.tick) || state.tick < 0 ||
        state.entityKeys.length !== keys.size ||
        state.entityKeys.some(([key, id]) => keys.get(key) !== id))
      throw new Error('Checkpoint topology or clock does not match constructed world');

    if (state.roomDetails !== undefined &&
        JSON.stringify([...roomDetails.entries()]) !== JSON.stringify(state.roomDetails))
      throw new Error('Checkpoint room metadata does not match castle topology');

    for (const [id, destination] of state.locations) {
      if (!entityExists(ecs, id) || !isRoom(destination))
        throw new Error('Checkpoint contains invalid entity position');
      const previous = locationOf(id);
      if (previous !== null && previous !== destination) removeComponent(ecs, id, LocatedIn(previous));
      if (previous !== destination) addComponent(ecs, id, LocatedIn(destination));
    }
    for (const [id, broken] of state.broken) {
      if (!hasComponent(ecs, id, Fragile)) throw new Error('Checkpoint references missing fragile object');
      Fragile.broken[id] = broken ? 1 : 0;
    }
    for (const [id, open] of state.doors) {
      if (!hasComponent(ecs, id, Door)) throw new Error('Checkpoint references missing door');
      Door.open[id] = open ? 1 : 0;
    }
    houseMembership.clear();
    for(const [id,house] of state.houseMembership??[]){
      if(!isCharacter(id)||!isHouseId(house))throw new Error('Invalid saved house');
      houseMembership.set(id,house);
    }
    pointAuthorities.clear();
    for(const [id,role] of state.pointAuthorities??[]){
      if(!isCharacter(id)||houseMembership.has(id)||
        (role!=='teacher'&&role!=='headmaster'))
        throw new Error('Invalid saved authority');
      pointAuthorities.set(id,role);
    }
    pointLedger.splice(0,pointLedger.length);
    for(const d of state.pointLedger??[]){
      if(!isCharacter(d.actor)||!pointAuthorities.has(d.actor)||
         !houseMembership.has(d.pupil)||houseMembership.get(d.pupil)!==d.house||
         d.id!==pointLedger.length+1||!Number.isSafeInteger(d.delta)||
         d.delta===0||Math.abs(d.delta)>50)
        throw new Error('Invalid saved point decision');
      pointLedger.push({...d,evidence:{...d.evidence}});
    }
    pointNews.clear();
    for(const id of Array.from(query(ecs,[Character])))pointNews.set(id,[]);
    for(const [id,items] of state.pointNews??[]){
      if(!isCharacter(id)||items.some(n=>
        !pointLedger.some(d=>d.id===n.decisionId)||
        (n.speaker!==undefined&&!isCharacter(n.speaker))))
        throw new Error('Invalid saved house news');
      pointNews.set(id,items.map(n=>({...n})));
    }
    const componentFlags = {
      vision: Vision, hearing: Hearing, inquisitive: Inquisitive,
      socialInvestigator: SociableInvestigator, guarded: Guarded,
      hasRoutine: HasRoutine, hasTimetable: HasTimetable,
      hasDailyLife: HasDailyLife,
      manuallyControlled: ManuallyControlled, experimental: Experimental,
      illuminated: Illuminated, seeksHelp: SeeksHelp, helpful: Helpful
    };
    for (const [id, flags] of state.flags) {
      if (!isCharacter(id)) throw new Error('Checkpoint references missing character');
      for (const name of Object.keys(componentFlags) as (keyof StateFlags)[]) {
        const component = componentFlags[name];
        if (flags[name]) addComponent(ecs, id, component);
        else removeComponent(ecs, id, component);
      }
    }
    for (const [observer, source, level] of state.trusts) setTrust(observer, source, level);
    for (const [learner, helper] of state.helpedBy) {
      if (!isCharacter(learner) || !isCharacter(helper)) throw new Error('Invalid assistance reference');
      addComponent(ecs, learner, HelpedBy(helper));
    }

    observationsByCharacter.clear();
    for (const [id, ledger] of state.observations) observationsByCharacter.set(id, ledger);
    for (const [id, ledger] of state.beliefs) beliefsByCharacter.replace(id, ledger);
    for (const [id, ledger] of state.learning) spellKnowledge.replace(id, ledger);

    timetables.clear();
    for (const [id, schedule] of state.schedules) timetables.set(id, schedule);
    dailyPlans.clear();
    for (const [id, plan] of state.dailyPlans) dailyPlans.set(id, plan);
    meals.clear();
    for (const [id, items] of state.meals) meals.set(id, items);
    conversations.clear();
    for (const [id, items] of state.conversations) conversations.set(id, items);
    rests.clear();
    for (const [id, items] of state.rests) rests.set(id, items);
    intentions.clear();
    for(const id of Array.from(query(ecs,[Character]))) intentions.set(id,[]);
    for(const [actor,goals] of state.intentions??[]){
      if(!isCharacter(actor)||goals.some(g=>!isRoom(g.destination)))
        throw new Error('Invalid checkpoint intention owner or destination');
      intentions.set(actor,goals.map(g=>({...g})));
    }
    bodilyNeeds.clear();
    for(const [actor,needs] of state.bodilyNeeds??[]){
      if(!isCharacter(actor)||!Number.isFinite(needs.hunger)||
         !Number.isFinite(needs.fatigue)||needs.hunger<0||needs.hunger>100||
         needs.fatigue<0||needs.fatigue>100)
        throw new Error('Invalid checkpoint bodily needs');
      bodilyNeeds.set(actor,{...needs});
    }
    for(const [actor,plan] of dailyPlans)
      if(plan.intentionPlanning && !bodilyNeeds.has(actor))
        bodilyNeeds.set(actor,{...INITIAL_NEEDS});
    commitments.splice(0,commitments.length,...(state.commitments ?? []).map(x=>({...x})));
    commitmentMemories.clear();
    for(const id of Array.from(query(ecs,[Character]))) commitmentMemories.set(id,[]);
    for(const [id,items] of state.commitmentMemories ?? []) {
      commitmentMemories.set(id,items.map(m=>({...m})));
    }
    routines.clear();
    for (const [id, route] of state.routines) routines.set(id, route);
    searches.clear();
    for (const [id, search] of state.searches) searches.set(id, {
      object: search.object, asked: new Set(search.asked),
      seenRooms: new Set(search.seenRooms), trail: search.trail
    });
    pendingTutoring.clear();
    for (const [id, request] of state.requests) pendingTutoring.set(id, request);
    attemptedTutors.clear();
    for (const [id, attempted] of state.attemptedTutors) attemptedTutors.set(id, new Set(attempted));
    assistanceHistory.clear();
    for (const [id, memories] of state.assistance) assistanceHistory.set(id, memories);
    events.splice(0, events.length, ...state.events);
    tick = state.tick;
  }

  return {
    room, roomInfo, character, fragileObject, connect, execute, step,
    registerHouse, grantPointAuthority, houseOf, housePoints, pointHistory,
    knownPointNews, pointReactions,
    captureRuntime, hydrateRuntime,
    setTrust, trustOf, setInquisitive, setSocialInvestigator, setGuarded, setRoutine, assessment,
    setTimetable, setManualControl, attendance, learningDebt, knowledgeGaps,
    setDailyLife, mealHistory, conversationHistory, restHistory,
    promiseHistory, meetingLedger, intentionHistory, needsOf,
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
