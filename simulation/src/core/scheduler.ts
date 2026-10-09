/**
 * The deterministic world-step scheduler. Consumes explicit, world-local
 * services instead of owning ECS stores or authoritative commands.
 */
import {performance} from 'node:perf_hooks';
import type { EntityId, Command, CommandResult, WorldEvent, Observation } from './Simulation.ts';
import { currentLesson, registerAttendance } from './school-time.ts';
import { nextSchoolJourney, nextWeightedSchoolJourney,feasibleMealJourney, shortestHops } from './school-planner.ts';
import {nextWeightedRoom} from './weighted-navigation.ts';
import {followPhysicalPassages,MICRO_PASSAGE_MINUTES} from './physical-travel.ts';
import {actorNextRoom,actorJourneyDuration,traverseActorJourney}
  from './actor-navigation.ts';
import { isActivePromise, personallyAvoids,
  type MeetingCommitment, type CommitmentMemory
} from './social-commitments.ts';
import { nextRoomOnRoute } from './navigation.ts';
import {advanceToiletNeed,closestBathroom,nextWitnessInquiry,type ToiletNeed} from './resident-life.ts';
import { planStudyIntention } from './learning-intentions.ts';
import { advanceNeeds,chooseNeedOrIntention,pickIntention,isOpenIntention,
  type PersonalIntention,type BodilyNeeds,type IntentionStatus,type Interruption
} from './intentions.ts';
import { decideInvestigation, type Assessment, type Trust } from './cognition.ts';
import { chooseMischiefTarget, livedMischiefMotive } from './mischief.ts';
import {arbitrateAutonomousAction} from './action-arbitration.ts';
import {chooseSocialResponse} from './social-choice.ts';
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
  intactFragiles(room: EntityId): EntityId[];
  passageAction(actor: EntityId, room: EntityId, next: EntityId): Command;
  exits(room: EntityId): EntityId[];
  knownExits(actor:EntityId,room:EntityId):EntityId[];
  passageMinutes(actor:EntityId,from:EntityId,to:EntityId):number|null;
  planActorRoute(actor:EntityId,from:EntityId,to:EntityId):
    import('./weighted-navigation.ts').WeightedRoute|null;
  usesUnifiedTravel(actor:EntityId):boolean;
  execute(command: Command): CommandResult;
  currentRoom(actor: EntityId): EntityId | null;
  occupants(room: EntityId): EntityId[];
  canAnswerWitnessQuestion(actor:EntityId):boolean;
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
  commitments: MeetingCommitment[];
  commitmentMemories: Map<EntityId, CommitmentMemory[]>;
  intentions: Map<EntityId,PersonalIntention[]>;
  bodilyNeeds: Map<EntityId,BodilyNeeds>;
  toiletNeeds: Map<EntityId,ToiletNeed>;
  transitionIntention(actor:EntityId,id:number,status:IntentionStatus,
    interruptedBy?:Interruption):void;
  resolveMeetings(minute: number): void;
  recordDailyRest(minute: number): void;
  spellKnowledge: {
    history(actor: number): LearningRecord[];
    stage(actor: number, spell: SpellId): import('./spellcraft.ts').SpellStage;
    learn(actor: number, spell: SpellId, next: Exclude<import('./spellcraft.ts').SpellStage, 'unaware'>, source: import('./spellcraft.ts').LearningSource): boolean;
  };
  beliefsByCharacter: { read(actor: number): Belief[] };
  setRoutine(actor: EntityId, destinations: readonly EntityId[]): void;
  emit(event: WorldEvent): void;
  // Optional diagnostic sink; never changes policy, scheduling or persistence.
  profile?: {phase(name:string,ms:number):void;command(ms:number):void};
};

export function runWorldStep(ctx: SchedulerContext): StepDecision[] {
  const {
    advanceClock, actors, has, visibleFragiles, intactFragiles, passageAction,
    exits, knownExits, passageMinutes, planActorRoute, usesUnifiedTravel,
    execute:executeRaw, currentRoom, occupants, canAnswerWitnessQuestion,observations, assessment,
    trustOf, knowledgeGaps, pendingTutoring, attemptedTutors, searches,
    timetables, routines, dailyPlans, meals, conversations, rests,
    commitments, commitmentMemories, intentions, bodilyNeeds,toiletNeeds,
    transitionIntention, resolveMeetings,
    spellKnowledge, beliefsByCharacter, setRoutine, emit, recordDailyRest
  } = ctx;
    const profiler=ctx.profile;
    let checkpoint=profiler?performance.now():0;
    const phase=(name:string):void=>{
      if(!profiler)return;
      const now=performance.now();
      profiler.phase(name,now-checkpoint);
      checkpoint=now;
    };
    const execute=(command:Command):CommandResult=>{
      if(!profiler)return executeRaw(command);
      const started=performance.now();
      try{return executeRaw(command);}
      finally{profiler.command(performance.now()-started);}
    };
    const minute = advanceClock();
    // Only opt-in characters have bodily state. Rest requires sustained
    // physical presence at home during actual sleeping hours, not a marker.
    for(const [actor,needs] of bodilyNeeds){
      const plan=dailyPlans.get(actor);
      if(!plan?.intentionPlanning) continue;
      bodilyNeeds.set(actor,advanceNeeds(
        needs,currentRoom(actor)===plan.homeRoom,minute));
    }
    for(const [actor,need] of toiletNeeds)
      toiletNeeds.set(actor,advanceToiletNeed(need,isSleepTime(minute)));
    const decisions: { actor: EntityId; action: Command; result: CommandResult }[] = [];
    // #30.6: track decided actors in O(1) instead of rescanning a growing
    // per-tick action array. Record EVERY sub-step, preserving action order.
    const decidedActors=new Set<EntityId>();
    const recordDecision=(record:StepDecision):void=>{
      decisions.push(record);
      decidedActors.add(record.actor);
    };
    const occupiedBySchool = new Set<EntityId>();
    const socialParticipants = new Set<EntityId>();
    const sleeping = new Set<EntityId>();
    const promisePriorities = new Set<EntityId>();
    const travelWorld={knownExits,passageMinutes,planActorRoute,
      passageAction,currentRoom,execute};
    const travelTime=(actor:number,from:number,to:number):number|null=>
      usesUnifiedTravel(actor)
        ?actorJourneyDuration(travelWorld,actor,from,to)
        :((hops=>hops===null?null:hops*10)(shortestHops(from,to,exits)));
    const travelTo=(actor:number,from:number,to:number):StepDecision|null=>{
      if(from===to)return null;
      if(usesUnifiedTravel(actor)){
        const steps=traverseActorJourney(travelWorld,actor,from,to);
        for(const {action,result} of steps)recordDecision({actor,action,result});
        const last=steps.at(-1);
        return last?{actor,action:last.action,result:last.result}:null;
      }
      const next=nextRoomOnRoute(from,to,exits);
      if(next===null)return null;
      const action=passageAction(actor,from,next);
      const result=execute(action);
      const record={actor,action,result};
      recordDecision(record);
      return record;
    };
    const mealFor=(actor:number,room:number,diningRoom:number,
      records:readonly MealMemory[],nextLesson:import('./school-time.ts').AttendanceRecord|null)=>
      feasibleMealJourney(minute,room,diningRoom,records,nextLesson,exits,
        usesUnifiedTravel(actor)?(from,to)=>travelTime(actor,from,to):undefined);
    const upcomingFor = (actor: EntityId) =>
      commitments.find(m => isActivePromise(m,minute) &&
        (m.promisor===actor || m.beneficiary===actor));
    phase('needs-and-clock');
    // Personal commitment priority can genuinely conflict with school duty.
    for(const actor of actors('dailyLife')) {
      const plan=dailyPlans.get(actor);
      if(plan?.commitmentPriority !== 'promise_first' ||
          has(actor,'manual')) continue;
      const promise=upcomingFor(actor);
      const room=currentRoom(actor);
      if(!promise || room===null) continue;
      const trip=travelTime(actor,room,promise.room);
      if(trip!==null && minute>=promise.atMinute-trip-10)
        promisePriorities.add(actor);
    }

    function estimateSchoolJourney(actor:EntityId,records:readonly import('./school-time.ts').AttendanceRecord[],
      room:EntityId){
      const travel=dailyPlans.get(actor)?.schoolTravel;
      if(usesUnifiedTravel(actor))
        return nextWeightedSchoolJourney(
          records,minute,room,
          location=>knownExits(actor,location),
          (a,b)=>passageMinutes(actor,a,b),10,
          (from,to)=>planActorRoute(actor,from,to));
      if(travel==='weighted-29')
        return nextWeightedSchoolJourney(
          records,minute,room,
          location=>knownExits(actor,location),
          (a,b)=>passageMinutes(actor,a,b));
      return nextSchoolJourney(records,minute,room,exits,10,
        travel==='micro-28'?MICRO_PASSAGE_MINUTES:10);
    }

    function travelTowardLesson(actor: EntityId, room: EntityId, goal: EntityId): void {
      if (room === goal) return;
      if(usesUnifiedTravel(actor)){travelTo(actor,room,goal);return;}
      const travel=dailyPlans.get(actor)?.schoolTravel;
      if(travel==='micro-28'||travel==='weighted-29'){
        // Each intermediate edge (and closed door) executes through the
        // authoritative world command handler, never a teleport.
        const actorExits=(location:number)=>travel==='weighted-29'
          ?knownExits(actor,location):exits(location);
        const cost=(a:number,b:number)=>passageMinutes(actor,a,b);
        const next=(a:number,b:number,edgeExits:(room:number)=>readonly number[])=>
          travel==='weighted-29'?nextWeightedRoom(a,b,edgeExits,cost):
            nextRoomOnRoute(a,b,edgeExits);
        for(const {action,result} of followPhysicalPassages({
          actor,startingRoom:room,destination:goal,
          exits:actorExits,nextRoom:next,passageAction,currentRoom,execute,
          ...(travel==='weighted-29'?{passageMinutes:cost}:{})
        }))recordDecision({actor,action,result});
        return;
      }
      const next = nextRoomOnRoute(room, goal,
        location => exits(location));
      if (next === null) return;
      const action: Command = passageAction(actor, room, next);
      const result = execute(action);
      recordDecision({ actor, action, result });
    }

    phase('promise-priority-and-helpers');
    // Lesson-first pupils reserve the school period and prepare ahead of time.
    // Other pupils may continue investigating, at the cost of late attendance.
    for (const actor of actors('timetable')) {
      const timetable = timetables.get(actor);
      const room = currentRoom(actor);
      if (!timetable || room === null || timetable.priority !== 'lesson_first' ||
          has(actor, 'manual') || promisePriorities.has(actor)) continue;
      if (dailyPlans.get(actor)?.schoolPlanning === 'adaptive') {
        const journey = estimateSchoolJourney(actor,timetable.records,room);
        if (!journey || !journey.committed) continue;
        const plan = dailyPlans.get(actor);
        const meal = plan && !journey.inClass
          ? mealFor(actor,room,plan.diningRoom,
              meals.get(actor) ?? [],journey.lesson)
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

    phase('school-commutes');
    // Need-driven, physically traversed toilet journeys. Classroom duty and
    // feasible imminent school journeys have priority over non-emergency trips.
    // An assigned bathroom is a destination, never a magical instant relief.
    for(const [actor,need] of toiletNeeds){
      if(has(actor,'manual')||occupiedBySchool.has(actor)||
         decidedActors.has(actor))continue;
      if(need.urgency<68)continue;
      const room=currentRoom(actor);
      if(room===null)continue;
      const lesson=estimateSchoolJourney(actor,timetables.get(actor)?.records??[],room);
      if(lesson?.committed)continue;
      const destination=closestBathroom(room,need.bathrooms,
        (from,to)=>travelTime(actor,from,to));
      if(destination===null)continue;
      if(room!==destination){
        const moved=travelTo(actor,room,destination);
        if(moved?.result.ok)occupiedBySchool.add(actor);
      }else{
        const action:Command={type:'use_toilet',actor};
        const result=execute(action);
        recordDecision({actor,action,result});
        if(result.ok)occupiedBySchool.add(actor);
      }
    }

    phase('toilet-needs');
    // A purposeful study meeting needs a separate validated TEACH action.
    // Co-location alone can fulfill a social promise but never grants knowledge.
    for(const meeting of commitments){
      if(meeting.status!=='pending' || !meeting.spell || meeting.taught ||
         minute<meeting.atMinute || minute>=meeting.atMinute+20) continue;
      const actor=meeting.beneficiary, learner=meeting.promisor;
      if(has(actor,'manual') || has(learner,'manual') ||
        occupiedBySchool.has(actor) || occupiedBySchool.has(learner) ||
        (decidedActors.has(actor)||decidedActors.has(learner))) continue;
      if(currentRoom(actor)!==meeting.room || currentRoom(learner)!==meeting.room)
        continue;
      const action:Command={type:'tutor_appointment',actor,meetingId:meeting.id};
      const result=execute(action);
      recordDecision({actor,action,result});
      if(result.ok){
        socialParticipants.add(actor);
        socialParticipants.add(learner);
        occupiedBySchool.add(actor);
        occupiedBySchool.add(learner);
      }
    }

    phase('tutoring-appointments');
    // A heard personal promise can override meals and leisure, but not a
    // scheduled lesson unless the actor explicitly prioritizes that promise.
    // Each actor considers only their own participation, not others' plans.
    for(const actor of actors('dailyLife')) {
      if(has(actor,'manual') || occupiedBySchool.has(actor) ||
        decidedActors.has(actor) ||
        dailyPlans.get(actor)?.intentionPlanning) continue;
      const promise=upcomingFor(actor);
      const room=currentRoom(actor);
      if(!promise || room===null) continue;
      const trip=travelTime(actor,room,promise.room);
      if(trip===null)continue;
      if(minute<promise.atMinute-trip-10)continue;
      // While a person waits, don't let their routine drag them elsewhere.
      if(room===promise.room){
        occupiedBySchool.add(actor);
        continue;
      }
      const moved=travelTo(actor,room,promise.room);
      if(moved)occupiedBySchool.add(actor);
    }

    phase('promise-travel');
    // Answer only invitations the actor actually heard. Both sides must still
    // be physically together, so neither can communicate at arbitrary range.
    for(const actor of actors('dailyLife')){
      if(has(actor,'manual') || occupiedBySchool.has(actor) ||
         socialParticipants.has(actor) || decidedActors.has(actor)) continue;
      const plan=dailyPlans.get(actor);
      if(plan?.socialInvitations !== true || !has(actor,'hearing')) continue;
      const offer=commitments.find(m=>m.status==='offered' &&
        m.beneficiary===actor && minute<m.atMinute-20 &&
        currentRoom(actor)===currentRoom(m.promisor));
      if(!offer) continue;
      const appointmentClashes=(timetables.get(actor)?.records??[]).some(lesson=>
        lesson.startsAt<offer.atMinute+20 && lesson.endsAt>offer.atMinute-20);
      const academicHelp=!offer.spell || willingToTutor({
        helpful:has(actor,'helpful'),
        trustsRequester:trustOf(actor,offer.promisor),
        knowsConcept:spellKnowledge.stage(actor,offer.spell)!=='unaware',
        // The invitation is the learner's audible request, already validated
        // against their personal gap when offered. Do not read their hidden mind.
        // Actual teaching revalidates whether they still need the concept.
        learnerNeedsConcept:true
      });
      const accept= academicHelp && !appointmentClashes &&
        !personallyAvoids(commitmentMemories.get(actor)??[],offer.promisor) &&
        trustOf(actor,offer.promisor)!=='distrusted' &&
        !(plan.style==='reserved' && offer.purpose==='explore');
      const action:Command={type:'answer_meeting',actor,meetingId:offer.id,accept};
      const result=execute(action);
      recordDecision({actor,action,result});
      if(result.ok){
        socialParticipants.add(actor);
        socialParticipants.add(offer.promisor);
      }
    }

    phase('invitation-replies');
    // R3: both initiative policies now propose candidates in one later
    // arbitration pass. Keep the historic phase marker for diagnostics.
    phase('mischief-initiative');
    // The same personal queue now admits the *causes* behind learning and
    // investigation. No goal is invented from someone else's private mind.
    // Creating an intention is mental bookkeeping, not a physical action.
    for(const actor of actors('dailyLife')){
      const plan=dailyPlans.get(actor);
      if(!plan?.intentionPlanning)continue;
      if(plan.learningAppointments && plan.socialInvitations &&
         actors('seeksHelp').includes(actor))
        for(const spell of knowledgeGaps(actor))
          if(!(intentions.get(actor)??[]).some(g=>isOpenIntention(g)&&
            g.kind==='learn_concept'&&g.spell===spell))
            execute({type:'intend_study',actor,spell});
    }
    for(const actor of actors('inquisitive')){
      if(!dailyPlans.get(actor)?.intentionPlanning || !has(actor,'vision') ||
        has(actor,'manual'))continue;
      const room=currentRoom(actor);
      if(room===null)continue;
      const claims=[...new Set(beliefsByCharacter.read(actor).map(b=>b.claim.object))];
      const inspected=new Set(observations(actor).filter(
        o=>o.kind==='inspected_object').map(o=>o.target));
      const target=decideInvestigation(
        claims.map(object=>assessment(actor,object)),
        visibleFragiles(room),inspected,true);
      if(target!==null)execute({type:'intend_investigate',actor,object:target});
    }
    // #25: any character's firsthand inspection can generate a causal goal.
    for(const actor of actors('dailyLife')){
      const plan=dailyPlans.get(actor);
      if(!plan?.evidenceInquiry||!plan.intentionPlanning||
         !has(actor,'hearing')||has(actor,'manual'))continue;
      const room=currentRoom(actor);
      if(room===null)continue;
      const known=new Set(beliefsByCharacter.read(actor).map(b=>b.claim.object));
      for(const observed of observations(actor)){
        if(observed.kind!=='inspected_object'||!observed.broken||
           known.has(observed.target)||
           !visibleFragiles(room).includes(observed.target)||
           (intentions.get(actor)??[]).some(g=>
             g.kind==='inquire'&&g.object===observed.target))continue;
        execute({type:'intend_inquire',actor,object:observed.target});
      }
    }

    phase('goal-generation');
    // R3: common gates first. Policies only propose, the arbitrator chooses
    // exactly one voluntary local action. No hidden global knowledge enters.
    for(const actor of actors('dailyLife')){
      const plan=dailyPlans.get(actor);
      if(!plan||(!plan.mischief&&plan.socialChoice!=='reflective')||
        has(actor,'manual')||occupiedBySchool.has(actor)||
        socialParticipants.has(actor)||decidedActors.has(actor)||
        promisePriorities.has(actor)||sleeping.has(actor)||
        isSleepTime(minute)||upcomingFor(actor))continue;
      const room=currentRoom(actor);
      if(room===null||currentLesson(timetables.get(actor)?.records??[],minute)||
        (intentions.get(actor)??[]).some(isOpenIntention))continue;
      const needs=bodilyNeeds.get(actor);
      if(needs&&(needs.hunger>=60||needs.fatigue>=85))continue;
      const nearbyPeople=occupants(room).filter(other=>other!==actor);
      const canSocial=plan.socialChoice==='reflective'&&isLeisure(minute)&&
        has(actor,'hearing')&&mealAt(minute)===null&&
        !talkedToday(conversations.get(actor)??[],dayOf(minute));
      const locals=canSocial?nearbyPeople.filter(other=>
        dailyPlans.has(other)&&has(other,'hearing')&&!has(other,'manual')&&
        !occupiedBySchool.has(other)&&!socialParticipants.has(other)&&
        !decidedActors.has(other)&&
        !talkedToday(conversations.get(other)??[],dayOf(minute))):[];
      const social=canSocial?chooseSocialResponse({
        actor,minute,history:commitmentMemories.get(actor)??[],
        people:locals,nearbyPeople,trust:other=>trustOf(actor,other),
        knownExits:knownExits(actor,room)
      }):null;
      const mischiefTarget=plan.mischief&&has(actor,'vision')
        ?chooseMischiefTarget({
          disposition:plan.mischief,
          motive:livedMischiefMotive(commitmentMemories.get(actor)??[],minute),
          intactObjects:intactFragiles(room),
          bystanders:nearbyPeople
        }):null;
      const selected=arbitrateAutonomousAction({social,mischiefTarget});
      if(!selected)continue;
      if(selected.kind==='mischief'){
        const action:Command={type:'break_object',actor,target:selected.target};
        const result=execute(action);
        recordDecision({actor,action,result});
      }else if(selected.response.kind==='chat'){
        const action:Command={type:'chat',actor,
          listener:selected.response.listener,topic:plan.interest};
        const result=execute(action);
        recordDecision({actor,action,result});
        if(result.ok){
          socialParticipants.add(actor);
          socialParticipants.add(selected.response.listener);
        }
      }else if(selected.response.kind==='leave')
        travelTo(actor,room,selected.response.destination);
    }
    // Opt-in intention arbitration. Scheduling, commitments and bodily needs
    // all compete through observed obligations, not a global RPG action score.
    // State transitions themselves do not consume an extra physical action.
    for(const actor of actors('dailyLife')){
      const plan=dailyPlans.get(actor);
      const needs=bodilyNeeds.get(actor);
      if(!plan?.intentionPlanning || !needs) continue;
      const goals=intentions.get(actor)??[];
      for(const goal of goals)
        if(isOpenIntention(goal) &&
          goal.deadlineMinute!==undefined && minute>goal.deadlineMinute)
          transitionIntention(actor,goal.id,'expired');
      // Reconcile a goal only against personal knowledge or an accepted
      // agreement the character actually participated in.
      for(const goal of goals.filter(isOpenIntention)){
        if(goal.kind==='inquire' && goal.object!==undefined&&
           beliefsByCharacter.read(actor).some(b=>b.claim.object===goal.object))
          transitionIntention(actor,goal.id,'completed');
        if(goal.kind==='learn_concept' && goal.spell &&
           spellKnowledge.stage(actor,goal.spell)!=='unaware')
          transitionIntention(actor,goal.id,'completed');
        if(goal.kind==='attend_meeting'){
          const meeting=commitments.find(m=>m.id===goal.meetingId &&
            (m.promisor===actor||m.beneficiary===actor));
          if(!meeting || meeting.status==='declined'||meeting.status==='unanswered')
            transitionIntention(actor,goal.id,'cancelled');
          else if(meeting.status==='kept'||meeting.status==='expired')
            transitionIntention(actor,goal.id,
              meeting.status==='kept'?'completed':'expired');
        }
      }
      const remaining=goals.filter(isOpenIntention);
      const promise=upcomingFor(actor);
      const blocked=has(actor,'manual')?'manual':
        (occupiedBySchool.has(actor) ? (promise?'promise':'lesson') :
        (decidedActors.has(actor) || socialParticipants.has(actor)
          ? (promise?'promise':'lesson'):null));
      if(blocked){
        for(const goal of remaining)
          if(goal.status==='active')
            transitionIntention(actor,goal.id,'paused',blocked);
        continue;
      }
      const room=currentRoom(actor);
      if(room===null)continue;
      const eligible=remaining.filter(goal=>{
        if(goal.kind==='learn_concept'){
          return isLeisure(minute)&&!commitments.some(m=>
            m.promisor===actor&&m.spell===goal.spell &&
            (m.status==='offered'||m.status==='pending'));
        }
        if(goal.kind==='inquire'&&room===goal.destination){
          if(goal.object===undefined||beliefsByCharacter.read(actor).some(b=>
             b.claim.object===goal.object))return false;
          const asked=new Set(goal.questioned??[]);
          return occupants(room).some(other=>other!==actor&&!asked.has(other)&&
            has(other,'hearing')&&canAnswerWitnessQuestion(other)&&
            !has(other,'manual')&&
            !occupiedBySchool.has(other)&&!socialParticipants.has(other)&&
            !decidedActors.has(other));
        }
        if(goal.kind==='attend_meeting'){
          const meeting=commitments.find(m=>m.id===goal.meetingId);
          if(!meeting || meeting.status!=='pending')return false;
          const trip=travelTime(actor,room,goal.destination);
          return trip!==null &&
            minute>=meeting.atMinute-trip-10 &&
            minute<meeting.atMinute+20;
        }
        return true;
      });
      const choice=chooseNeedOrIntention(
        needs,minute,eligible,kind=>ateMeal(meals.get(actor)??[],dayOf(minute),kind));
      // Meal service is a window, not instantaneous food wherever hunger
      // strikes. Plan the actual journey *before* the serving window closes,
      // reusing the same path/time feasibility rules as the academic planner.
      const nextSchool=estimateSchoolJourney(
        actor,timetables.get(actor)?.records??[],room);
      const mealJourney=mealFor(actor,room,plan.diningRoom,
        meals.get(actor)??[],nextSchool?.lesson??null);
      const bestGoal=pickIntention(eligible);
      const seekMeal=needs.hunger>=24 &&
        (needs.hunger>=60||bestGoal?.importance!=='important');
      if(mealJourney && seekMeal && choice.kind!=='eat'){
        for(const goal of remaining)
          if(goal.status==='active')
            transitionIntention(actor,goal.id,'paused','hunger');
        if(room!==plan.diningRoom)travelTo(actor,room,plan.diningRoom);
        continue;
      }
      const target=choice.kind==='visit'||choice.kind==='pursue'
        ?choice.intention:null;
      for(const goal of remaining){
        if(goal.id===target?.id)continue;
        if(goal.status==='active')
          transitionIntention(actor,goal.id,'paused',
            choice.kind==='eat'?'hunger':
            choice.kind==='rest'?'fatigue':
            choice.kind==='idle' && goal.kind==='learn_concept'?'waiting':
            choice.kind==='idle' && goal.kind==='attend_meeting'?'waiting':
            'higher_priority');
      }
      if(choice.kind==='eat'){
        // Physical journey and legal meal command only during serving hours.
        if(room!==plan.diningRoom)travelTo(actor,room,plan.diningRoom);
        else{
          const action:Command={type:'eat_meal',actor,kind:choice.meal};
          const result=execute(action);
          recordDecision({actor,action,result});
        }
        continue;
      }
      if(choice.kind==='rest'){
        if(room===plan.homeRoom){sleeping.add(actor);continue;}
        travelTo(actor,room,plan.homeRoom);
        continue;
      }
      if(choice.kind==='visit'||choice.kind==='pursue'){
        const goal=choice.intention;
        if(goal.kind==='learn_concept' && goal.spell){
          const intention=planStudyIntention({
            learner:actor,gaps:[goal.spell],
            room:plan.leisureRoom??plan.socialRoom??room,
            candidates:occupants(room),
            attempted:attemptedTutors.get(actor)??new Set<string>(),
            memories:commitmentMemories.get(actor)??[],
            trust:other=>trustOf(actor,other),
            available:other=>has(other,'hearing') && !has(other,'manual') &&
              !occupiedBySchool.has(other) && !socialParticipants.has(other) &&
              !decidedActors.has(other),
            minute
          });
          if(!intention){
            transitionIntention(actor,goal.id,'paused','waiting');
          }
          if(intention){
            const action:Command={type:'offer_meeting',actor,
              listener:intention.helper,room:intention.room,
              atMinute:intention.atMinute,purpose:'study',spell:intention.spell};
            const result=execute(action);
            recordDecision({actor,action,result});
            if(result.ok){
              transitionIntention(actor,goal.id,'active');
              socialParticipants.add(actor);
              socialParticipants.add(intention.helper);
            }
          }
          continue;
        }
        if(goal.kind==='inquire'&&goal.object!==undefined){
          // Shared with Filch: finite local candidates, no access to anyone's
          // private thoughts and no omniscient remote object tracking.
          if(room!==goal.destination){
            const moved=travelTo(actor,room,goal.destination);
            if(moved)transitionIntention(actor,goal.id,'active');
            continue;
          }
          const people=occupants(room).filter(other=>
            other!==actor&&has(other,'hearing')&&
            canAnswerWitnessQuestion(other)&&!has(other,'manual')&&
            !occupiedBySchool.has(other)&&!socialParticipants.has(other)&&
            !decidedActors.has(other));
          const inquiry=nextWitnessInquiry([goal.object],people,
            (goal.questioned??[]).map(id=>goal.object+':'+id));
          if(!inquiry){
            transitionIntention(actor,goal.id,'paused','waiting');
            continue;
          }
          const action:Command={type:'ask_about',actor,
            listener:inquiry.listener,object:inquiry.object};
          const result=execute(action);recordDecision({actor,action,result});
          if(result.ok){
            (goal.questioned??=[]).push(inquiry.listener);
            if(beliefsByCharacter.read(actor).some(b=>b.claim.object===goal.object))
              transitionIntention(actor,goal.id,'completed');
            else transitionIntention(actor,goal.id,'paused','waiting');
          }else transitionIntention(actor,goal.id,'paused','waiting');
          continue;
        }
        if(goal.kind==='investigate' && goal.object!==undefined){
          // Navigate to the room *last personally observed*, never to the
          // object's omniscient current position; reality is checked on arrival.
          if(room!==goal.destination){
            const moved=travelTo(actor,room,goal.destination);
            if(moved)transitionIntention(actor,goal.id,'active');
            continue;
          }
          const action:Command={type:'inspect_object',actor,target:goal.object};
          const result=execute(action);
          recordDecision({actor,action,result});
          if(!result.ok)transitionIntention(actor,goal.id,'cancelled');
          continue;
        }
        if(goal.kind==='attend_meeting'){
          const meeting=commitments.find(m=>m.id===goal.meetingId &&
            (m.promisor===actor||m.beneficiary===actor));
          if(!meeting || meeting.status!=='pending')continue;
          if(room===goal.destination){
            transitionIntention(actor,goal.id,'active');
            occupiedBySchool.add(actor);
            continue;
          }
          const moved=travelTo(actor,room,goal.destination);
          if(moved){
            transitionIntention(actor,goal.id,'active');
            if(moved.result.ok)occupiedBySchool.add(actor);
          }
          continue;
        }
        if(room===goal.destination){
          transitionIntention(actor,goal.id,'completed');
          continue;
        }
        const moved=travelTo(actor,room,goal.destination);
        if(moved){
          transitionIntention(actor,goal.id,'active');
          if(moved.result.ok&&currentRoom(actor)===goal.destination)
            transitionIntention(actor,goal.id,'completed');
        }
        continue;
      }
      // The lack of a personal quest is not immobility. Ordinary free time
      // still has habitual social destinations and curfew-driven homeward
      // travel. The old planner and new one share the same public topology.
      if(choice.kind==='idle'){
        const destination=isLeisure(minute)
          ? leisureDestination(plan,minute)
          : shouldReturnHome(minute)?plan.homeRoom:null;
        if(destination!==null&&destination!==room)
          travelTo(actor,room,destination);
      }
      // Idle characters can now share common rooms and talk; neither a
      // closed kitchen nor a sleeping period invents free nourishment.
    }

    // Basic daily needs have the same physical travel/action rules as classes.
    // No character has to know where any other character is to eat or go home.
    for (const actor of actors('dailyLife')) {
      if (has(actor, 'manual') || occupiedBySchool.has(actor) ||
          decidedActors.has(actor)) continue;
      const plan = dailyPlans.get(actor);
      const room = currentRoom(actor);
      if (!plan || room === null || plan.intentionPlanning) continue;
      // A locally chosen retreat isn't undone by automatic hub relocation
      // on the very next tick. Once the remembered impulse expires, normal
      // daily habits resume without an extra global avoidance state.
      if(plan.socialChoice==='reflective' && isLeisure(minute) &&
         livedMischiefMotive(commitmentMemories.get(actor)??[],minute) &&
         room!==leisureDestination(plan,minute))continue;

      if (isSleepTime(minute) && room === plan.homeRoom) {
        sleeping.add(actor);
        continue;
      }
      const meal = mealAt(minute);
      const knownMeals = meals.get(actor) ?? [];
      if (plan.schoolPlanning === 'adaptive') {
        const timeline = timetables.get(actor);
        const journey = timeline
          ? estimateSchoolJourney(actor,timeline.records,room) : null;
        const opportunity=mealFor(actor,room,plan.diningRoom,
          knownMeals,journey?.lesson??null);
        if (opportunity) {
          // We can walk before a meal window, but never eat before it starts.
          if(room!==plan.diningRoom)travelTo(actor,room,plan.diningRoom);
          else if(meal===opportunity.kind){
            const action:Command={type:'eat_meal',actor,kind:opportunity.kind};
            const result=execute(action);
            recordDecision({actor,action,result});
          }
          continue;
        }
      } else if (meal !== null && !ateMeal(knownMeals, dayOf(minute), meal)) {
        if(room!==plan.diningRoom)travelTo(actor,room,plan.diningRoom);
        else{
          const action:Command={type:'eat_meal',actor,kind:meal};
          const result=execute(action);
          recordDecision({actor,action,result});
        }
        continue;
      }
      // Leisure is spent in a shared hub, sleep in a private bedroom.
      const destination = isLeisure(minute)
        ? leisureDestination(plan, minute) : plan.homeRoom;
      if(shouldReturnHome(minute)&&room!==destination)
        travelTo(actor,room,destination);
    }

    phase('intention-arbitration');
    // First, helpers respond to requests they actually heard earlier. Being
    // busy with a scheduled lesson defers help; no involuntary class skipping.
    // One response consumes one NPC action this tick.
    for (const request of [...pendingTutoring.values()]) {
      const helper = request.helper;
      if (has(helper, 'manual') || occupiedBySchool.has(helper) || sleeping.has(helper) ||
          decidedActors.has(helper)) continue;
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
      recordDecision({ actor: helper, action, result });
      if (result.ok) {
        socialParticipants.add(helper);
        socialParticipants.add(request.requester);
      }
    }

    // A pupil knows their own concrete gap and notices people sharing a room.
    // They do NOT consult the bystander's hidden knowledge or private plans.
    for (const actor of actors('seeksHelp')) {
      if (dailyPlans.get(actor)?.learningAppointments === true) continue;
      if (has(actor, 'manual') || occupiedBySchool.has(actor) || sleeping.has(actor) ||
          socialParticipants.has(actor) || decidedActors.has(actor) ||
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
      recordDecision({ actor, action, result });
      if (result.ok) {
        socialParticipants.add(actor);
        socialParticipants.add(target.helper);
      }
    }

    phase('tutoring-and-requests');
    // The decision policy reads only the actor's beliefs and locally visible
    // objects. In particular it never reads authoritative broken-state or events.
    for (const actor of actors('inquisitive')) {
      if (dailyPlans.get(actor)?.intentionPlanning) continue;
      if (has(actor, 'manual') || occupiedBySchool.has(actor) || sleeping.has(actor) ||
          socialParticipants.has(actor) || decidedActors.has(actor)) continue;
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
      recordDecision({ actor, action, result });
    }
    // A separate opt-in social policy keeps the original inspection policy
    // independent. One physical/social action per NPC per tick.
    for (const actor of actors('socialInvestigator')) {
      if (has(actor, 'manual') || occupiedBySchool.has(actor) || sleeping.has(actor) ||
          socialParticipants.has(actor) || decidedActors.has(actor)) continue;
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
        recordDecision({ actor, action, result });
        continue;
      }

      // Depth-first exploration discovers one room at a time, without knowing
      // where a source is. Only public adjacent exits are inspected.
      const unexplored=(usesUnifiedTravel(actor)?knownExits(actor,room):exits(room))
        .filter(next=>!search!.seenRooms.has(next))
        .sort((a,b)=>usesUnifiedTravel(actor)
          ?(passageMinutes(actor,room,a)??Infinity)-
             (passageMinutes(actor,room,b)??Infinity)||a-b
          :a-b);
      const next=unexplored[0];
      if(next!==undefined){
        const moved=travelTo(actor,room,next);
        // Searching visits exactly one new location per decision tick,
        // even if the graph would permit a longer trip. The observer must
        // physically enter a room before considering it explored.
        if(moved?.result.ok&&currentRoom(actor)===next){
          search.seenRooms.add(next);
          search.trail.push(next);
        }
        continue;
      }
      if(search.trail.length>1){
        const parent=search.trail[search.trail.length-2]!;
        const moved=travelTo(actor,room,parent);
        if(moved?.result.ok&&currentRoom(actor)===parent)search.trail.pop();
      }
    }
    phase('investigation');
    // Inquiry-first pupils attend once they have no higher-priority action.
    // Remaining within a lesson's room takes priority over leisure routines.
    for (const actor of actors('timetable')) {
      if (has(actor, 'manual') || socialParticipants.has(actor) || sleeping.has(actor) ||
          decidedActors.has(actor)) continue;
      const timetable = timetables.get(actor);
      const room = currentRoom(actor);
      if (!timetable || room === null || timetable.priority !== 'inquiry_first') continue;
      const lesson = currentLesson(timetable.records, minute);
      if (!lesson) continue;
      occupiedBySchool.add(actor);
      travelTowardLesson(actor, room, lesson.room);
    }

    phase('inquiry-first-lessons');
    // Actual conversation is a shared, local event. It consumes a tick for
    // both people and writes autobiographical memories to both ledgers.
    for (const actor of actors('dailyLife')) {
      if (!isLeisure(minute) || has(actor, 'manual') || sleeping.has(actor) ||
          occupiedBySchool.has(actor) || socialParticipants.has(actor) ||
          decidedActors.has(actor)) continue;
      const plan = dailyPlans.get(actor);
      const room = currentRoom(actor);
      if (!plan || plan.socialChoice==='reflective' || room === null || room !== leisureDestination(plan, minute) ||
          !has(actor, 'hearing') ||
          (plan.style === 'reserved' && !isWeekend(minute))) continue;
      const memories = conversations.get(actor) ?? [];
      if (talkedToday(memories, dayOf(minute))) continue;
      const available = occupants(room).filter(other =>
        dailyPlans.has(other) && has(other, 'hearing') &&
        !has(other, 'manual') && !sleeping.has(other) &&
        !occupiedBySchool.has(other) && !socialParticipants.has(other) &&
        !decidedActors.has(other) &&
        !talkedToday(conversations.get(other) ?? [], dayOf(minute)));
      const listener = chooseLocalCompanion(actor, available, memories,
        dayOf(minute), other => personallyAvoids(
          commitmentMemories.get(actor) ?? [],other
        ) ? 'distrusted' : trustOf(actor,other));
      if (listener === null) continue;
      const action: Command = {
        type: 'chat', actor, listener, topic: plan.interest
      };
      const result = execute(action);
      recordDecision({ actor, action, result });
      if (result.ok) {
        socialParticipants.add(actor);
        socialParticipants.add(listener);
      }
    }

    phase('conversations');
    // Learning appointments arise from an actual personal knowledge gap.
    // Learners only ask visible local people, not globally known teachers.
    // Their invitations are requests, not proof the listener can help.
    for(const actor of actors('seeksHelp')){
      const plan=dailyPlans.get(actor);
      if(plan?.intentionPlanning)continue; // the unified planner owns this need
      if(!plan?.learningAppointments || !plan.socialInvitations ||
        has(actor,'manual') || !has(actor,'hearing') ||
        occupiedBySchool.has(actor) || socialParticipants.has(actor) ||
        decidedActors.has(actor)) continue;
      const room=currentRoom(actor);
      if(room===null || !isLeisure(minute)) continue;
      const gaps=knowledgeGaps(actor);
      if(gaps.some(spell=>commitments.some(m=>m.promisor===actor &&
        m.spell===spell && (m.status==='offered'||m.status==='pending'))))continue;
      const intention=planStudyIntention({
        learner:actor,gaps,room:plan.leisureRoom??plan.socialRoom??room,
        candidates:occupants(room),
        attempted:attemptedTutors.get(actor)??new Set<string>(),
        memories:commitmentMemories.get(actor)??[],
        trust:other=>trustOf(actor,other),
        available:other=>has(other,'hearing') && !has(other,'manual') &&
          !occupiedBySchool.has(other) && !socialParticipants.has(other) &&
          !decidedActors.has(other),
        minute
      });
      if(!intention)continue;
      const action:Command={type:'offer_meeting',actor,
        listener:intention.helper,room:intention.room,
        atMinute:intention.atMinute,purpose:'study',spell:intention.spell};
      const result=execute(action);
      recordDecision({actor,action,result});
      if(result.ok){
        socialParticipants.add(actor);
        socialParticipants.add(intention.helper);
      }
    }

    phase('study-invitations');
    // Offer one future meeting per initiator-week, only to a person met
    // previously in this actor's own autobiographical conversation history.
    // This is opt-in and does not query the target's intentions or memories.
    for(const actor of actors('dailyLife')){
      const plan=dailyPlans.get(actor);
      const room=currentRoom(actor);
      if(!plan?.socialInvitations || plan.style!=='outgoing' ||
        room===null || !isLeisure(minute) || dayOf(minute)%7>=5 ||
        room!==leisureDestination(plan,minute) || !has(actor,'hearing') ||
        has(actor,'manual') || occupiedBySchool.has(actor) ||
        socialParticipants.has(actor) || sleeping.has(actor) ||
        decidedActors.has(actor)) continue;
      const ownHistory=commitmentMemories.get(actor)??[];
      if(ownHistory.some(m=>m.kind==='offered' &&
        dayOf(m.minute)>=dayOf(minute)-6)) continue;
      const local=new Set(occupants(room));
      const past=conversations.get(actor)??[];
      const candidate=past.map(m=>m.partner).find(other=>
        local.has(other) && other!==actor && has(other,'hearing') &&
        !has(other,'manual') && !socialParticipants.has(other) &&
        !occupiedBySchool.has(other) &&
        !decidedActors.has(other) &&
        trustOf(actor,other)!=='distrusted' &&
        !personallyAvoids(ownHistory,other));
      if(candidate===undefined) continue;
      const atMinute=(dayOf(minute)+1)*1440 + 19*60+40;
      const action:Command={
        type:'offer_meeting',actor,listener:candidate,
        room,atMinute,purpose:plan.interest==='lessons'?'study':'explore'
      };
      const result=execute(action);
      if(result.ok){
        recordDecision({actor,action,result});
        socialParticipants.add(actor);
        socialParticipants.add(candidate);
      }
    }

    phase('social-invitations');
    // Any opt-in character can physically inspect their nearby environment,
    // independent of caretaker-specific hardcoded routines.
    for(const actor of actors('dailyLife')){
      if(!dailyPlans.get(actor)?.evidenceInquiry||has(actor,'manual')||
         !has(actor,'vision')||occupiedBySchool.has(actor)||
         sleeping.has(actor)||socialParticipants.has(actor)||
         decidedActors.has(actor))continue;
      const room=currentRoom(actor);
      if(room===null)continue;
      const seen=new Set(observations(actor).filter(o=>
        o.kind==='inspected_object').map(o=>o.target));
      const object=visibleFragiles(room).filter(id=>!seen.has(id))
        .sort((a,b)=>a-b)[0];
      if(object===undefined)continue;
      const action:Command={type:'inspect_object',actor,target:object};
      const result=execute(action);
      recordDecision({actor,action,result});
    }

    phase('evidence-inspection');
    // A curious experimenter can apply a genuinely learned pattern.
    // They must previously have performed guided practice; no secret unlock.
    for (const actor of actors('experimental')) {
      if (has(actor, 'manual') || occupiedBySchool.has(actor) || sleeping.has(actor) ||
          socialParticipants.has(actor) || decidedActors.has(actor)) continue;
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
      recordDecision({ actor, action, result });
    }

    phase('spell-practice');
    // Independent routines produce movement from explicit destination goals.
    // They use the castle's public topology, never hidden character locations.
    for (const actor of actors('routine')) {
      if (has(actor, 'manual') || occupiedBySchool.has(actor) ||
          socialParticipants.has(actor) || decidedActors.has(actor)) continue;
      const pending = routines.get(actor);
      const room = currentRoom(actor);
      if (!pending || room === null) continue;
      while (pending[0] === room) pending.shift();
      if (pending.length === 0) {
        setRoutine(actor, []);
        continue;
      }
      const goal = pending[0]!;
      const moved=travelTo(actor,room,goal);
      if(moved?.result.ok&&currentRoom(actor)===goal){
        pending.shift();
        if(pending.length===0)setRoutine(actor,[]);
      }
    }
    phase('independent-routines');
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
            lesson.arrivedAt === undefined || lesson.arrivedAt > minute ||
            (lesson.teacher !== undefined &&
              currentRoom(lesson.teacher) !== lesson.room)) continue;
        const learned = spellKnowledge.learn(actor, lesson.spell, 'conceptual',
          { kind: 'lesson', lessonId: lesson.id, minute });
        if (learned) emit({
          type: 'spell_concept_learned', actor, spell: lesson.spell, source: 'lesson', minute
        });
      }
    }
    resolveMeetings(minute);
    recordDailyRest(minute);
    phase('attendance-and-rest');
    return decisions;
  }

