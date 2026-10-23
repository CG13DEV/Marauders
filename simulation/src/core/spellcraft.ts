/**
 * [GAME] Small semantic spell definition, NOT a whole spell-graph runtime.
 * World systems own physical effects; personal knowledge never owns world truth.
 */
export const spellDefinitions = {
  lumos: {
    intent: 'illuminate',
    semanticTarget: 'wand_tip',
    operation: 'emit_light',
    incantation: 'Lumos'
  }
} as const;

export type SpellId = keyof typeof spellDefinitions;
export type SpellStage = 'unaware' | 'conceptual' | 'guided' | 'independent';
export type LearningSource =
  | { kind: 'lesson'; lessonId: string; minute: number }
  | { kind: 'tutoring'; teacher: number; minute: number }
  | { kind: 'library'; book: number; minute: number }
  | { kind: 'guided_practice'; teacher: number; minute: number }
  | { kind: 'independent_practice'; minute: number }
  | { kind: 'prior_training' };

export type LearningRecord = {
  spell: SpellId;
  stage: Exclude<SpellStage, 'unaware'>;
  source: LearningSource;
};

const stages: Readonly<Record<SpellStage, number>> = {
  unaware: 0, conceptual: 1, guided: 2, independent: 3
};

function cloneSource(source: LearningSource): LearningSource {
  return { ...source };
}

export function isSpellId(value: string): value is SpellId {
  return Object.prototype.hasOwnProperty.call(spellDefinitions, value);
}

/** One ledger per simulation world, owned by its creator. */
export function createSpellKnowledge() {
  const memory = new Map<number, LearningRecord[]>();

  function register(character: number): void {
    if (memory.has(character)) throw new Error('Duplicate spell-knowledge owner');
    memory.set(character, []);
  }

  function stage(actor: number, spell: SpellId): SpellStage {
    return memory.get(actor)?.filter(r => r.spell === spell).at(-1)?.stage ?? 'unaware';
  }

  function learn(actor: number, spell: SpellId, next: Exclude<SpellStage, 'unaware'>, source: LearningSource): boolean {
    const history = memory.get(actor);
    if (!history) throw new Error('Unknown spell-knowledge owner');
    if (stages[next] <= stages[stage(actor, spell)]) return false;
    if (stages[next] > stages[stage(actor, spell)] + 1 && source.kind !== 'prior_training') {
      throw new Error('Learning stages cannot be skipped');
    }
    history.push({ spell, stage: next, source: cloneSource(source) });
    return true;
  }

  function history(actor: number): LearningRecord[] {
    return (memory.get(actor) ?? []).map(r => ({
      spell: r.spell, stage: r.stage, source: cloneSource(r.source)
    }));
  }
  function replace(actor: number, records: readonly LearningRecord[]): void {
    if (!memory.has(actor)) throw new Error('Unknown spell-knowledge owner');
    memory.set(actor, records.map(record => ({
      spell: record.spell, stage: record.stage, source: cloneSource(record.source)
    })));
  }

  return { register, stage, learn, history, replace };
}
