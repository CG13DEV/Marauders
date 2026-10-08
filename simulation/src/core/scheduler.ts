/**
 * The deterministic world-step scheduler. Consumes explicit, world-local
 * services instead of owning ECS stores or authoritative commands.
 */
import type { EntityId, Command, CommandResult, WorldEvent, Observation } from './Simulation.ts';
import { currentLesson, registerAttendance } from './school-time.ts';
import { nextSchoolJourney, feasibleMealJourney } from './school-planner.ts';
import { nextRoomOnRoute } from './navigation.ts';
import { decideInvestigation, type Assessment, type Trust } from './cognition.ts';
import { spellDefinitions, type SpellId, type LearningRecord } from './spellcraft.ts';
import type { Belief } from './beliefs.ts';
import { willingToTutor, type TutoringRequest } from './social-learning.ts';
import type { WitnessSearch, TimetableState } from './runtime-stores.ts';
import {
  mealAt, ateMeal, dayOf, isWeekend, isLeisure, isSleepTime,
  shouldReturnHome, talkedToday, chooseLocalCompanion, leisureDestination,
  type DailyLifePlan, type MealMemory, type ConversationMemory, type RestMemory
} from './daily-life.ts';

export type AgentTrait = 'timetable' | 'seeksHelp' | 'inquisitive' | 'socialInvestigator' | 'experimental' | 'routine' | 'dailyLife';
export type ActorFlag = 'manual' | 'vision' | 'hearing' | 'helpful';
export type StepDecision = { actor: EntityId; action: Command; result: CommandResult };

export type SchedulerContext = {
  advanceClock(): number;
  actors(trait: AgentTrait): EntityId[];
  has(actor: EntityId, flag: ActorFlag): boolean;
  visibleFragiles(room: EntityId): EntityId[];
  passageAction(actor: EntityId, room: EntityId, next: EntityId): Command;
  exits(room: EntityId): EntityId[];
  execute(command: Command): CommandResult;
  currentRoom(actor: EntityId): EntityId | null;
  occupants(room: EntityId): EntityId[];
  observations(actor: EntityId): Observation[];
  assessment(observer: EntityId, object: EntityId): Assessment;
  trustOf(observer: EntityId, source: EntityId): Trust;
  knowledgeGaps(actor: EntityId): SpellId[];
  pendingTutoring: Map<EntityId, TutoringRequest>;
  attemptedTutors: Map<EntityId, Set<string>>;
  searches: Map<EntityId, WitnessSearch>;
  timetables: Map<EntityId, TimetableState>;
  routines: Map<EntityId, EntityId[]>;
  dailyPlans: Map<EntityId, DailyLifePlan>;
  meals: Map<EntityId, MealMemory[]>;
  conversations: Map<EntityId, ConversationMemory[]>;
  rests: Map<EntityId, RestMemory[]>;
  recordDailyRest(minute: number): void;
  spellKnowledge: {
    history(actor: number): LearningRecord[];
    stage(actor: number, spell: SpellId): import('./spellcraft.ts').SpellStage;
    learn(actor: number, spell: SpellId, next: Exclude<import('./spellcraft.ts').SpellStage, 'unaware'>, source: import('./spellcraft.ts').LearningSource): boolean;
  };
  beliefsByCharacter: { read(actor: number): Belief[] };
  setRoutine(actor: EntityId, destinations: readonly EntityId[]): void;
  emit(event: WorldEvent): void;
};

export function runWorldStep(ctx: SchedulerContext): StepDecision[] {
  const {
    advanceClock, actors, has, visibleFragiles, passageAction,
    exits, execute, currentRoom, occupants, observations, assessment,
    trustOf, knowledgeGaps, pendingTutoring, attemptedTutors, searches,
    timetables, routines, dailyPlans, meals, conversations, rests,
    spellKnowledge, beliefsByCharacter, setRoutine, emit, recordDailyRest
  } = ctx;
    const minute = advanceClock();
    const decisions: { actor: EntityId; action: Command; result: CommandResult }[] = [];
    const occupiedBySchool = new Set<EntityId>();
    const socialParticipants = new Set<EntityId>();
    const sleeping = new Set<EntityId>();

    function travelTowardLesson(actor: EntityId, room: EntityId, goal: EntityId): void {
      if (room === goal) return;
      const next = nextRoomOnRoute(room, goal,
        location => exits(location));
      if (next === null) return;
      const action: Command = passageAction(actor, room, next);
      const result = execute(action);
      decisions.push({ actor, action, result });
    }

    // Lesson-first pupils reserve the school period and prepare ahead of time.
    // Other pupils may continue investigating, at the cost of late attendance.
    for (const actor of actors('timetable')) {
      const timetable = timetables.get(actor);
      const room = currentRoom(actor);
      if (!timetable || room === null || timetable.priority !== 'lesson_first' ||
          has(actor, 'manual')) continue;
      if (dailyPlans.get(actor)?.schoolPlanning === 'adaptive') {
        const journey = nextSchoolJourney(timetable.records, minute, room, exits);
        if (!journey || !journey.committed) continue;
        const plan = dailyPlans.get(actor);
        const meal = plan && !journey.inClass
          ? feasibleMealJourney(minute, room, plan.diningRoom,
              meals.get(actor) ?? [], journey.lesson, exits)
          : null;
        // A viable meal may precede class; the next pass executes the travel.
        if (meal !== null) continue;
        occupiedBySchool.add(actor);
        travelTowardLesson(actor, room, journey.lesson.room);
      } else {
        const lesson = currentLesson(timetable.records, minute);
        if (!lesson) continue;
        occupiedBySchool.add(actor);
        travelTowardLesson(actor, room, lesson.room);
      }
    }

    // Basic daily needs have the same physical travel/action rules as classes.
    // No character has to know where any other character is to eat or go home.
    for (const actor of actors('dailyLife')) {
      if (has(actor, 'manual') || occupiedBySchool.has(actor) ||
          decisions.some(d => d.actor === actor)) continue;
      const plan = dailyPlans.get(actor);
      const room = currentRoom(actor);
      if (!plan || room === null) continue;

      if (isSleepTime(minute) && room === plan.homeRoom) {
        sleeping.add(actor);
        continue;
      }
      const meal = mealAt(minute);
      const knownMeals = meals.get(actor) ?? [];
      if (plan.schoolPlanning === 'adaptive') {
        const timeline = timetables.get(actor);
        const journey = timeline
          ? nextSchoolJourney(timeline.records, minute, room, exits) : null;
        const opportunity = feasibleMealJourney(minute, room,
          plan.diningRoom, knownMeals, journey?.lesson ?? null, exits);
        if (opportunity) {
          // We can walk before a meal window, but never eat before it starts.
          const action: Command | null = room === plan.diningRoom
            ? (meal === opportunity.kind
              ? {type:'eat_meal',actor,kind:opportunity.kind} : null)
            : (() => {
                const next=nextRoomOnRoute(room,plan.diningRoom,exits);
                return next === null ? null : passageAction(actor,room,next);
              })();
          if(action){
            const result=execute(action);
            decisions.push({actor,action,result});
          }
          continue;
        }
      } else if (meal !== null && !ateMeal(knownMeals, dayOf(minute), meal)) {
        const action: Command = room === plan.diningRoom
          ? { type: 'eat_meal', actor, kind: meal }
          : (() => {
              const next = nextRoomOnRoute(room, plan.diningRoom, exits);
              return next === null ? null : passageAction(actor, room, next);
            })()!;
        if (action) {
          const result = execute(action);
          decisions.push({ actor, action, result });
        }
        continue;
      }
      // Leisure is spent in a shared hub, sleep in a private bedroom.
      const destination = isLeisure(minute)
        ? leisureDestination(plan, minute) : plan.homeRoom;
      if (shouldReturnHome(minute) && room !== destination) {
        const next = nextRoomOnRoute(room, destination, exits);
        if (next !== null) {
          const action = passageAction(actor, room, next);
          const result = execute(action);
          decisions.push({ actor, action, result });
        }
      }
    }

    // First, helpers respond to requests they actually heard earlier. Being
    // busy with a scheduled lesson defers help; no involuntary class skipping.
    // One response consumes one NPC action this tick.
    for (const request of [...pendingTutoring.values()]) {
      const helper = request.helper;
      if (has(helper, 'manual') || occupiedBySchool.has(helper) || sleeping.has(helper) ||
          decisions.some(d => d.actor === helper)) continue;
      if (currentRoom(helper) === null ||
          currentRoom(helper) !== currentRoom(request.requester)) continue;
      const accept = willingToTutor({
        helpful: has(helper, 'helpful'),
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
    for (const actor of actors('seeksHelp')) {
      if (has(actor, 'manual') || occupiedBySchool.has(actor) || sleeping.has(actor) ||
          socialParticipants.has(actor) || decisions.some(d => d.actor === actor) ||
          pendingTutoring.has(actor) || !has(actor, 'hearing')) continue;
      const room = currentRoom(actor);
      if (room === null) continue;
      const gaps = knowledgeGaps(actor);
      if (gaps.length === 0) continue;
      const attempted = attemptedTutors.get(actor)!;
      const locals = occupants(room).filter(other =>
        other !== actor && has(other, 'hearing'));
      const ranked = locals.sort((a, b) => {
        const ranks: Record<Trust, number> = { trusted: 2, neutral: 1, distrusted: 0 };
        return ranks[trustOf(actor, b)] - ranks[trustOf(actor, a)] || a - b;
      });
      const candidates = ranked.filter(other =>
        trustOf(actor, other) !== 'distrusted' &&
        !occupiedBySchool.has(other) && !sleeping.has(other) && !socialParticipants.has(other));
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
    for (const actor of actors('inquisitive')) {
      if (has(actor, 'manual') || occupiedBySchool.has(actor) || sleeping.has(actor) ||
          socialParticipants.has(actor) || decisions.some(d => d.actor === actor)) continue;
      if (!has(actor, 'vision')) continue;
      const room = currentRoom(actor);
      if (room === null) continue;
      const visibleObjects = visibleFragiles(room);
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
    for (const actor of actors('socialInvestigator')) {
      if (has(actor, 'manual') || occupiedBySchool.has(actor) || sleeping.has(actor) ||
          socialParticipants.has(actor) || decisions.some(d => d.actor === actor)) continue;
      if (!has(actor, 'hearing')) continue;
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
      const interview = sources.find(s => local.has(s) && has(s, 'hearing'));
      if (interview !== undefined) {
        const action: Command = { type: 'ask_about', actor, listener: interview, object: target };
        const result = execute(action);
        if (result.ok) search.asked.add(interview);
        decisions.push({ actor, action, result });
        continue;
      }

      // Depth-first exploration discovers one room at a time, without knowing
      // where a source is. Only public adjacent exits are inspected.
      const unexplored = exits(room)
        .filter(next => !search!.seenRooms.has(next)).sort((a, b) => a - b);
      const next = unexplored[0];
      if (next !== undefined) {
        const action: Command = passageAction(actor, room, next);
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
    for (const actor of actors('timetable')) {
      if (has(actor, 'manual') || socialParticipants.has(actor) || sleeping.has(actor) ||
          decisions.some(d => d.actor === actor)) continue;
      const timetable = timetables.get(actor);
      const room = currentRoom(actor);
      if (!timetable || room === null || timetable.priority !== 'inquiry_first') continue;
      const lesson = currentLesson(timetable.records, minute);
      if (!lesson) continue;
      occupiedBySchool.add(actor);
      travelTowardLesson(actor, room, lesson.room);
    }

    // Actual conversation is a shared, local event. It consumes a tick for
    // both people and writes autobiographical memories to both ledgers.
    for (const actor of actors('dailyLife')) {
      if (!isLeisure(minute) || has(actor, 'manual') || sleeping.has(actor) ||
          occupiedBySchool.has(actor) || socialParticipants.has(actor) ||
          decisions.some(d => d.actor === actor)) continue;
      const plan = dailyPlans.get(actor);
      const room = currentRoom(actor);
      if (!plan || room === null || room !== leisureDestination(plan, minute) ||
          !has(actor, 'hearing') ||
          (plan.style === 'reserved' && !isWeekend(minute))) continue;
      const memories = conversations.get(actor) ?? [];
      if (talkedToday(memories, dayOf(minute))) continue;
      const available = occupants(room).filter(other =>
        dailyPlans.has(other) && has(other, 'hearing') &&
        !has(other, 'manual') && !sleeping.has(other) &&
        !occupiedBySchool.has(other) && !socialParticipants.has(other) &&
        !decisions.some(d => d.actor === other) &&
        !talkedToday(conversations.get(other) ?? [], dayOf(minute)));
      const listener = chooseLocalCompanion(actor, available, memories,
        dayOf(minute), other => trustOf(actor, other));
      if (listener === null) continue;
      const action: Command = {
        type: 'chat', actor, listener, topic: plan.interest
      };
      const result = execute(action);
      decisions.push({ actor, action, result });
      if (result.ok) {
        socialParticipants.add(actor);
        socialParticipants.add(listener);
      }
    }

    // A curious experimenter can apply a genuinely learned pattern.
    // They must previously have performed guided practice; no secret unlock.
    for (const actor of actors('experimental')) {
      if (has(actor, 'manual') || occupiedBySchool.has(actor) || sleeping.has(actor) ||
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
    for (const actor of actors('routine')) {
      if (has(actor, 'manual') || occupiedBySchool.has(actor) ||
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
        location => exits(location));
      if (next === null) continue; // unreachable destination: do not teleport
      const action: Command = passageAction(actor, room, next);
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
    recordDailyRest(minute);
    return decisions;
  }

