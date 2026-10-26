/**
 * [GAME] G5.1. Pure language surface: providers return text, never game commands.
 * The authoritative simulation owns all facts and changes.
 */
export type NarrativeRequest = {
  kind: 'scene' | 'dialogue';
  instructions: string;
  input: string;
};

export interface NarrativeProvider {
  generate(request: NarrativeRequest): Promise<string>;
}

export class MockNarrativeProvider implements NarrativeProvider {
  readonly requests: NarrativeRequest[] = [];
  async generate(request: NarrativeRequest): Promise<string> {
    this.requests.push({ ...request });
    const data = JSON.parse(request.input) as {
      view?: { room: string }; perspective?: { name: string };
    };
    return request.kind === 'scene'
      ? '[mock] Ты находишься здесь: ' + (data.view?.room ?? 'неизвестно') + '.'
      : '[mock] ' + (data.perspective?.name ?? 'Собеседник') +
        ': Я слушаю. Для свободной речи включи OpenAI API.';
  }
}

type HttpFetch = typeof fetch;

/** Node-only adapter. Never bundle this module or API secrets into the browser. */
export class OpenAINarrativeProvider implements NarrativeProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly effort: 'none' | 'low' | 'medium';
  private readonly fetchImpl: HttpFetch;
  private readonly timeoutMs: number;

  constructor(config: {
    apiKey?: string;
    model?: string;
    effort?: 'none' | 'low' | 'medium';
    fetchImpl?: HttpFetch;
    timeoutMs?: number;
  } = {}) {
    this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.model = config.model ?? process.env.MARAUDERS_NARRATIVE_MODEL ?? 'gpt-6-luna';
    this.effort = config.effort ?? 'low';
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 20000;
    if (!this.apiKey) throw new Error('OPENAI_API_KEY is not configured (use mock mode).');
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1000 || this.timeoutMs > 60000)
      throw new Error('Invalid narrative request timeout');
  }

  async generate(request: NarrativeRequest): Promise<string> {
    if (request.instructions.length > 10000 || request.input.length > 16000)
      throw new Error('Narrative request exceeds bounded context');
    const response = await this.fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + this.apiKey,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: this.model,
        reasoning: { effort: this.effort },
        instructions: request.instructions,
        input: request.input,
        max_output_tokens: 500,
        store: false
      })
    });
    if (!response.ok)
      throw new Error('OpenAI narrative request failed (HTTP ' + response.status + ').');
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || !('status' in data) ||
        data.status !== 'completed' || !('output' in data) || !Array.isArray(data.output))
      throw new Error('OpenAI returned an incomplete narrative response');
    const chunks: string[] = [];
    for (const item of data.output) {
      if (!item || typeof item !== 'object' || item.type !== 'message' ||
          !Array.isArray(item.content)) continue;
      for (const block of item.content)
        if (block && typeof block === 'object' && block.type === 'output_text' &&
            typeof block.text === 'string') chunks.push(block.text);
    }
    const result = chunks.join('\n').trim();
    if (!result) throw new Error('OpenAI returned no narrative text');
    return result;
  }
}
