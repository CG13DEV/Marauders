/**
 * [GAME] #31.2 — minimal first-action initiative.
 * A disposition isn't an instruction to break a named object. The actor needs
 * a currently co-located, intact, visible opportunity; a cautious actor won't
 * take it while anyone else is visibly present. No world event log is read.
 */
export type MischiefDisposition='reckless'|'cautious';
export function chooseMischiefTarget(input:{
  disposition:MischiefDisposition;
  intactObjects:readonly number[];
  bystanders:readonly number[];
}):number|null{
  if(input.disposition==='cautious'&&input.bystanders.length>0)
    return null;
  // Deterministic local tie-break, independent of entity enumeration order.
  return input.intactObjects.length?Math.min(...input.intactObjects):null;
}
