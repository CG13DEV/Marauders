/**
 * [GAME] Presentation-only architectural slots in a circular room shell.
 * Angles: 0=+Z (portrait entrance), +PI/2=+X (girls), -PI/2=-X
 * (boys), PI=-Z (fireplace). All positions are derived from one radius.
 * Room keys / ECS edges remain entirely authoritative in the graph manifest.
 */
const PI=Math.PI;
const slot=(id,type,angle,width,extra={})=>Object.freeze({
  id,type,angle,width,...extra
});
export const COMMON_SLOTS=Object.freeze([
  slot('portrait','portrait',0,2.65,{portal:'outside'}),
  slot('boys','stair',-PI/2,2.55,{portal:'wing',wing:'boys'}),
  slot('girls','stair',PI/2,2.55,{portal:'wing',wing:'girls'}),
  slot('fireplace','fireplace',PI,4.15),
  slot('west_window','window',-2.42,1.55),
  slot('east_window','window',2.42,1.55)
]);
export const BEDROOM_SLOTS=Object.freeze([
  slot('return','door',0,2.45,{portal:'return'}),
  slot('west_window','window',-2.5,1.50),
  slot('east_window','window',2.5,1.50)
]);
export const LANDING_SLOTS=Object.freeze([
  slot('return','portrait',PI,2.60,{portal:'return'}),
  slot('west_window','window',-2.3,1.45),
  slot('east_window','window',2.3,1.45)
]);
export function signedAngle(a,b){
  return Math.atan2(Math.sin(a-b),Math.cos(a-b));
}
export function slotsFor(kind){
  if(kind==='common')return COMMON_SLOTS;
  if(kind==='landing')return LANDING_SLOTS;
  if(kind==='bedroom')return BEDROOM_SLOTS;
  throw Error('Unknown room architecture kind: '+kind);
}
export function roomAnchor(radius,angle,inset=0){
  return {x:Math.sin(angle)*(radius-inset),
    z:Math.cos(angle)*(radius-inset)};
}
export function openingHalfAngle(slot,radius){
  return Math.atan2(slot.width/2,radius);
}
export function slotAt(angle,slots,radius){
  return slots.find(slot=>
    Math.abs(signedAngle(angle,slot.angle))<=
      openingHalfAngle(slot,radius))??null;
}
export function validateSlots(slots,radius){
  const seen=new Set();
  for(const item of slots){
    if(seen.has(item.id))throw Error('Duplicate slot: '+item.id);
    seen.add(item.id);
    if(!Number.isFinite(item.angle)||item.width<=0||
      item.width>radius*1.1)throw Error('Invalid opening: '+item.id);
    for(const other of slots){
      if(item===other)continue;
      const margin=openingHalfAngle(item,radius)+
        openingHalfAngle(other,radius)+.025;
      if(Math.abs(signedAngle(item.angle,other.angle))<margin)
        throw Error('Overlapping openings: '+item.id+' and '+other.id);
    }
  }
  return true;
}
