import type { Belief } from './beliefs.ts';

/**
 * GAME: trust is an ordinal social attitude, not a fabricated probability.
 * Even a trusted witness can be mistaken or lying.
 */
export type Trust = 'trusted' | 'neutral' | 'distrusted';
export type Report = { culprit: number; speakers: { id: number; trust: Trust }[] };
export type Assessment =
  | { status: 'unknown'; object: number }
  | { status: 'witnessed'; object: number; culprit: number }
  | { status: 'reported' | 'contested'; object: number; reports: Report[]; favoredCulprit: number | null };

const rank: Record<Trust, number> = { trusted: 2, neutral: 1, distrusted: 0 };

/** Evaluate a character's own evidence ONLY, never the authoritative event log. */
export function assessReports(
  object: number,
  beliefs: readonly Belief[],
  trustOf: (speaker: number) => Trust
): Assessment {
  const relevant = beliefs.filter(b => b.claim.kind === 'broke_object' && b.claim.object === object);
  const witnessed = relevant.find(b => b.evidence.kind === 'vision');
  if (witnessed) return { status: 'witnessed', object, culprit: witnessed.claim.culprit };

  const reports: Report[] = [];
  for (const entry of relevant) {
    if (entry.evidence.kind !== 'testimony') continue;
    let group = reports.find(g => g.culprit === entry.claim.culprit);
    if (!group) {
      group = { culprit: entry.claim.culprit, speakers: [] };
      reports.push(group);
    }
    const speaker = entry.evidence.speaker;
    if (!group.speakers.some(s => s.id === speaker)) {
      group.speakers.push({
        id: speaker,
        trust: trustOf(speaker)
      });
    }
  }
  if (reports.length === 0) return { status: 'unknown', object };

  const ratings = reports.map(g => Math.max(...g.speakers.map(s => rank[s.trust])));
  const best = Math.max(...ratings);
  const bestCount = ratings.filter(r => r === best).length;
  // A single strongest *nondistrusted* source suggests a lead, never a fact.
  const winner = best > 0 && bestCount === 1
    ? reports[ratings.indexOf(best)]!.culprit
    : null;
  return {
    status: reports.length > 1 ? 'contested' : 'reported',
    object,
    reports,
    favoredCulprit: winner
  };
}

/**
 * A tiny deterministic NPC policy. The agent may investigate a contested
 * rumor if it sees the referenced object nearby; it never knows its true
 * broken-state or culprit ahead of inspection.
 */
export function decideInvestigation(
  assessments: readonly Assessment[],
  visibleObjects: readonly number[],
  alreadyInspected: ReadonlySet<number>,
  inquisitive: boolean
): number | null {
  if (!inquisitive) return null;
  const visible = new Set(visibleObjects);
  const targets = assessments
    .filter(a => a.status === 'contested' && visible.has(a.object) && !alreadyInspected.has(a.object))
    .map(a => a.object)
    .sort((a, b) => a - b);
  return targets[0] ?? null;
}
