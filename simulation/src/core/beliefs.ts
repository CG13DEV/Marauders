/**
 * Character-local, structured beliefs. No entry is an authoritative world fact.
 * Testimony records what a speaker SAID; the claim itself may be false.
 */
export type Claim = {
  kind: 'broke_object';
  culprit: number;
  object: number;
};

export type Evidence =
  | { kind: 'vision'; eventSequence: number }
  | { kind: 'testimony'; speaker: number; eventSequence: number;
      origin?: { kind: 'vision' } | { kind: 'testimony'; speaker: number } };

export type Belief = {
  claim: Claim;
  evidence: Evidence;
};

export function copyClaim(claim: Claim): Claim {
  return { kind: claim.kind, culprit: claim.culprit, object: claim.object };
}

function cloneEvidence(evidence: Evidence): Evidence {
  return evidence.kind === 'testimony' && evidence.origin
    ? { ...evidence, origin: { ...evidence.origin } }
    : { ...evidence };
}

export function createBeliefStore() {
  const records = new Map<number, Belief[]>();

  function register(character: number): void {
    if (records.has(character)) throw new Error('Character already registered');
    records.set(character, []);
  }

  function remember(character: number, claim: Claim, evidence: Evidence): void {
    const ledger = records.get(character);
    if (!ledger) throw new Error('Unregistered recipient');
    ledger.push({ claim: copyClaim(claim), evidence: cloneEvidence(evidence) });
  }

  function read(character: number): Belief[] {
    const ledger = records.get(character);
    return ledger ? ledger.map(entry => ({
      claim: copyClaim(entry.claim),
      evidence: cloneEvidence(entry.evidence)
    })) : [];
  }

  function replace(character: number, history: readonly Belief[]): void {
    if (!records.has(character)) throw new Error('Unregistered belief owner');
    records.set(character, history.map(entry => ({
      claim: copyClaim(entry.claim), evidence: cloneEvidence(entry.evidence)
    })));
  }

  return { register, remember, read, replace };
}
