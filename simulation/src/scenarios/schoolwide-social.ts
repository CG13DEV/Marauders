/**
 * [GAME] Full-population opt-in for already-social-capable school residents.
 * This is a POLICY rollout, not a new personality generator.
 *
 * Do not assign meal/sleep/social behaviours to cats, ghosts, poltergeists,
 * or dedicated patrol agents simply to tick a coverage checkbox.
 */
import type {createSchoolWeek} from './school-week.ts';

type SchoolScene=ReturnType<typeof createSchoolWeek>;
export type SchoolSocialMode='baseline'|'all-eligible';

export function installSchoolwideSocialPolicy(
  scene:SchoolScene,mode:SchoolSocialMode
){
  const {world,students,professors,residents}=scene;
  const roster=[...students.map(p=>p.id),...professors.map(p=>p.id),
    ...(residents?.people.map(p=>p.id)??[])];
  if(new Set(roster).size!==roster.length)
    throw Error('School population has duplicate character IDs');
  const configured=new Map(world.captureRuntime().dailyPlans);
  // Every pupil and staff member with an established human daily-life plan
  // is eligible; nonhuman and patrol shells deliberately keep their policies.
  const eligible=roster.filter(actor=>configured.has(actor));
  const excluded=roster.filter(actor=>!configured.has(actor));
  if(mode==='all-eligible'){
    for(const [index,actor] of eligible.entries()){
      const existing=configured.get(actor)!;
      world.setDailyLife(actor,{
        ...existing,
        socialInvitations:true,
        relationshipLearning:true,
        contextualRelationships:true,
        socialChoice:'reflective',
        repairInitiative:true,
        // Heterogeneous willingness is a *pre-existing policy choice*, not
        // a dynamic omniscient reward triggered by someone else's history.
        repairResponse:index%3===0?'guarded':'open'
      });
    }
  }
  const after=new Map(world.captureRuntime().dailyPlans);
  const actuallyEnabled=eligible.filter(actor=>{
    const p=after.get(actor);
    return p?.socialInvitations===true&&
      p.relationshipLearning===true&&p.contextualRelationships===true&&
      p.socialChoice==='reflective'&&p.repairInitiative===true;
  });
  if(mode==='all-eligible'&&actuallyEnabled.length!==eligible.length)
    throw Error('School-wide rollout silently missed an eligible resident');
  for(const actor of excluded)
    if(after.has(actor))throw Error('Nonhuman/patrol daily-life pollution');
  return {
    mode,roster:roster.length,students:students.length,
    professors:professors.length,otherResidents:residents?.people.length??0,
    eligible:eligible.length,enabled:actuallyEnabled.length,
    excluded:excluded.map(id=>world.label(id)),
    // Names/IDs only for diagnostics. No character is selected as a target.
    pupilPolicies:students.filter(p=>actuallyEnabled.includes(p.id)).length,
    facultyPolicies:professors.filter(p=>actuallyEnabled.includes(p.id)).length
  };
}
