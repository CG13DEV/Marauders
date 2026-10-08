/**
 * Topological perception prototype: one room of sensory reach.
 * It is deliberately NOT geometric line-of-sight or an acoustics engine.
 *
 * An open connection permits vision; a closed door still permits hearing.
 * Neither sense crosses more than one room link.
 */
export function perceiveCrash(facts: {
  sameRoom: boolean;
  adjacentRoom: boolean;
  openView: boolean;
  vision: boolean;
  hearing: boolean;
}): 'witnessed' | 'heard' | null {
  if (facts.vision && (facts.sameRoom || (facts.adjacentRoom && facts.openView))) {
    return 'witnessed';
  }
  if (facts.hearing && (facts.sameRoom || facts.adjacentRoom)) {
    return 'heard';
  }
  return null;
}
