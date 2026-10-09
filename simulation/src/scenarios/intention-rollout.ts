/**
 * [GAME] Experiment #20 population audit: report consequences separately from
 * invariants. Late classes or fewer meals can be meaningful outcomes; physical
 * teleportation or missing character memories cannot.
 */
import type { Simulation } from '../core/Simulation.ts';
import type { IntentionRolloutStage } from './school-week.ts';
import { reportSchoolWeek, rolloutPopulation, type createSchoolWeek } from './school-week.ts';

export type SchoolWeekScene = ReturnType<typeof createSchoolWeek>;

export function auditIntentionRollout(scene:SchoolWeekScene){
  const {world,students,professors,rollout}=scene;
  const report=reportSchoolWeek(scene);
  const population=rolloutPopulation(rollout);
  const selectedPupils=students.filter(s=>world.needsOf(s.id)!==null);
  const selectedTeachers=professors.filter(p=>world.needsOf(p.id)!==null);
  const selected=[...selectedPupils.map(s=>s.id),...selectedTeachers.map(p=>p.id)];
  const states=selected.map(id=>world.needsOf(id)!);
  const goals=selected.flatMap(id=>world.intentionHistory(id));
  const events=world.events();
  const movements=events.filter(e=>e.type==='entity_moved');
  const errors:string[]=[];
  if(selectedPupils.length!==population.pupils)errors.push('wrong pupil opt-in population');
  if(selectedTeachers.length!==population.teachers)errors.push('wrong teacher opt-in population');
  if(states.some(s=>!Number.isFinite(s.hunger)||!Number.isFinite(s.fatigue)||
    s.hunger<0||s.hunger>100||s.fatigue<0||s.fatigue>100))
    errors.push('invalid bodily state');
  // Never infer "moved there" from current location alone. Verify the entire
  // factual movement stream against physical passages in the castle topology.
  if(movements.some(e=>!world.exits(e.from).includes(e.to)))
    errors.push('impossible movement');
  if(states.length && states.reduce((n,body)=>n+body.hunger,0)/states.length>=80)
    errors.push('mass chronic hunger after weekly rollout');
  if(population.pupils===84 && report.pupilConversations===0)
    errors.push('social life collapsed under full population rollout');
  if(report.attendance.on_time+report.attendance.late+
      report.attendance.missed+report.attendance.pending!==750)
    errors.push('lost pupil timetable record');
  if(report.teacherLessonSlots!==155)errors.push('lost teacher timetable record');
  if(report.attendance.pending>0 && world.tick()>=1008)
    errors.push('unresolved pupil attendance after week');
  const orderedEvents=events.filter(e=>e.type==='intention_changed');
  // Explicit keys preserve compile-time integrity: tests cannot silently
  // interpret an omitted category as an undefined value.
  const byKind={
    visit:goals.filter(g=>g.kind==='visit').length,
    learn_concept:goals.filter(g=>g.kind==='learn_concept').length,
    attend_meeting:goals.filter(g=>g.kind==='attend_meeting').length,
    investigate:goals.filter(g=>g.kind==='investigate').length
  };
  const byStatus={
    queued:goals.filter(g=>g.status==='queued').length,
    active:goals.filter(g=>g.status==='active').length,
    paused:goals.filter(g=>g.status==='paused').length,
    completed:goals.filter(g=>g.status==='completed').length,
    expired:goals.filter(g=>g.status==='expired').length,
    cancelled:goals.filter(g=>g.status==='cancelled').length
  };
  const sum=(values:readonly number[])=>values.reduce((a,b)=>a+b,0);
  const round=(value:number)=>Math.round(value*10)/10;
  return {
    stage:rollout,
    opted:{pupils:selectedPupils.length,teachers:selectedTeachers.length},
    pupils:report.pupils,professors:report.professors,
    attendance:report.attendance,
    lumos:report.firstYearKnowsLumos,
    social:{
      invitations:report.invitations,accepted:report.acceptedInvitations,
      declined:report.declinedInvitations,fulfilled:report.fulfilledMeetings,
      broken:report.missedMeetings,unanswered:report.unansweredInvitations,
      conversations:report.pupilConversations/2
    },
    meals:{
      pupils:report.pupilMeals,
      teachers:sum(professors.map(p=>world.mealHistory(p.id).length))
    },
    rest:{
      pupils:report.pupilRests,
      teachers:sum(professors.map(p=>world.restHistory(p.id).length))
    },
    body:selected.length?{
      meanHunger:round(sum(states.map(s=>s.hunger))/states.length),
      meanFatigue:round(sum(states.map(s=>s.fatigue))/states.length),
      maxHunger:Math.max(...states.map(s=>s.hunger)),
      maxFatigue:Math.max(...states.map(s=>s.fatigue))
    }:null,
    goals:{byKind,byStatus,transitions:orderedEvents.length,
      pauses:orderedEvents.filter(e=>e.status==='paused').length,
      resumed:orderedEvents.filter(e=>e.status==='active').length},
    tutoring:events.filter(e=>e.type==='tutoring_appointment_completed').length,
    movementActions:movements.length,
    invariants:{ok:errors.length===0,errors}
  };
}

