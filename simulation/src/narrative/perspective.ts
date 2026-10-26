/**
 * [GAME] G5.1: a bounded, character-local projection. NEVER pass
 * captureRuntime(), events(), other people's private memories or world truth
 * to a narrative model.
 */
import type {Simulation} from '../core/Simulation.ts';
import {spellDefinitions, type SpellId} from '../core/spellcraft.ts';

export function scenePerspective(world:Simulation, player:number) {
  const senses=world.sensesOf(player);
  const location=world.currentRoom(player);
  if(!senses||location===null)throw Error('Scene viewer must be a located character');
  return {
    room:world.label(location),
    time:world.clock().label,
    senses,
    people:senses.vision
      ?world.occupants(location).filter(id=>id!==player).map(id=>world.label(id)).slice(0,40)
      :[],
    books:senses.vision?world.visibleBooks(player).map(b=>b.label).slice(0,20):[],
    magic:senses.vision?world.visibleMagicObjects(player)
      .map(o=>({label:o.label,position:o.position,light:o.light})).slice(0,20):[],
    knownExits:world.knownExits(player,location).map(id=>world.label(id)).slice(0,20),
    personalObservations:world.observations(player).slice(-8).map(item=>
      item.kind==='witnessed_breakage'
        ?{kind:item.kind,actor:world.label(item.actor),object:world.label(item.target)}
        :item.kind==='inspected_object'
        ?{kind:item.kind,object:world.label(item.target),broken:item.broken}
        :{kind:item.kind})
  };
}

export function npcPerspective(world:Simulation,npc:number,player:number,
  profile?:string) {
  const senses=world.sensesOf(npc);
  const playerSenses=world.sensesOf(player);
  const location=world.currentRoom(npc);
  if(!senses||!playerSenses||location===null||location!==world.currentRoom(player))
    throw Error('Dialogue requires two co-located characters');
  if(!senses.hearing||!playerSenses.hearing)
    throw Error('Dialogue requires both characters to hear');
  if(npc===player)throw Error('Cannot speak to yourself');
  return {
    name:world.label(npc),
    player:world.label(player),
    room:world.label(location),
    time:world.clock().label,
    // The profile is authored GAME style, never inferred as an ECS psychological state.
    authoredPersonality:profile??null,
    disposition:world.socialDispositionOf(npc),
    bodilyNeeds:world.needsOf(npc),
    currentMood:'not modeled explicitly',
    relationshipToPlayer:world.relationshipOf(npc,player),
    magicKnowledge:(Object.keys(spellDefinitions) as SpellId[])
      .map(spell=>({spell,stage:world.spellStage(npc,spell)})),
    knownMagicPrimitives:world.knownMagicPrimitives(npc),
    recentLearning:world.learningHistory(npc).slice(-10)
      .map(entry=>({spell:entry.spell,stage:entry.stage,source:entry.source.kind})),
    lessons:world.attendance(npc).slice(0,12)
      .map(l=>({subject:l.subject,status:l.status,startsAt:l.startsAt,endsAt:l.endsAt})),
    personalBeliefs:world.beliefs(npc).slice(-8).map(b=>({
      claim:'Виновник '+world.label(b.claim.culprit)+', предмет '+world.label(b.claim.object),
      source:b.evidence.kind,
      ...(b.evidence.kind==='testimony'?{reportedBy:world.label(b.evidence.speaker)}:{})
    })),
    personalObservations:world.observations(npc).slice(-8).map(item=>
      item.kind==='witnessed_breakage'
        ?{kind:item.kind,actor:world.label(item.actor),object:world.label(item.target)}
        :item.kind==='inspected_object'
        ?{kind:item.kind,object:world.label(item.target),broken:item.broken}
        :{kind:item.kind}),
    conversationMemories:world.conversationHistory(npc).filter(m=>m.partner===player)
      .slice(-8).map(m=>({topic:m.topic,minute:m.minute})),
    commitmentMemories:world.promiseHistory(npc).filter(m=>m.partner===player)
      .slice(-8).map(m=>({kind:m.kind,purpose:m.purpose,minute:m.minute})),
    nearbyPeople:senses.vision?world.occupants(location)
      .filter(id=>id!==npc).map(id=>world.label(id)).slice(0,25):[],
    nearbyBooks:world.visibleBooks(npc).map(b=>b.label).slice(0,12),
    nearbyMagic:world.visibleMagicObjects(npc)
      .map(o=>({label:o.label,position:o.position,light:o.light})).slice(0,12)
  };
}
