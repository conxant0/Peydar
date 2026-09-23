export const relevances = ['relevant', 'maybe', 'irrelevant'] as const;
export type Relevance = typeof relevances[number];

export type ClassificationInput = {
  researchProfile: { question: string; description: string; interests: string[]; nonInterests: string[] };
  paper: { title: string; abstract: string };
};

export type ClassificationResult = { relevance: Relevance; confidence: number };

export type Classify = (input: ClassificationInput) => Promise<{ result: ClassificationResult; model: string; latencyMs: number }>;

// Bump when the question or criteria text changes so stored results stay interpretable.
export const configVersion = 'relevance-choice-v1';

export class ClassifierError extends Error {
  // True when the service itself is unreachable or overloaded, so later papers would fail too.
  unavailable: boolean;
  constructor(message: string, unavailable = false) {
    super(message);
    this.unavailable = unavailable;
  }
}

export const testMode = () => process.env.JEV_TEST_MODE === '1';

export function classifierRequest(input: ClassificationInput, model: string) {
  const { question, description, interests, nonInterests } = input.researchProfile;
  return {
    model,
    state: {
      research_profile: { question, description, interests, non_interests: nonInterests },
      paper: { title: input.paper.title, abstract: input.paper.abstract },
    },
    questions: {
      relevance: {
        type: 'choice',
        instructions: 'Given this research profile, is this paper worth inspecting for this research topic?',
        criteria: {
          relevant: 'The paper substantially addresses the research question or one or more central interests.',
          maybe: 'The paper is meaningfully adjacent and may contain useful concepts, methods, or related work, but its connection is not clearly central.',
          irrelevant: 'The paper does not materially contribute to the research topic or primarily concerns explicitly excluded areas.',
        },
      },
    },
  };
}

export function parseClassifierResponse(body: unknown): ClassificationResult {
  const answer = (body as { answers?: { relevance?: { type?: unknown; choice?: unknown; confidence?: unknown } } })?.answers?.relevance;
  if (!answer || answer.type !== 'choice') throw new ClassifierError('Classifier response has no relevance choice.');
  if (!relevances.includes(answer.choice as Relevance)) throw new ClassifierError(`Classifier returned an unexpected label: ${JSON.stringify(answer.choice)}.`);
  const confidence = answer.confidence;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new ClassifierError(`Classifier returned an invalid confidence: ${JSON.stringify(confidence)}.`);
  }
  return { relevance: answer.choice as Relevance, confidence };
}

type Options = { baseUrl?: string; model?: string; timeoutMs?: number; fetch?: typeof fetch };

export function classifierTimeoutMs() {
  return Number(process.env.JEV_TIMEOUT_MS) || 60_000;
}

export function createClassifier(options: Options = {}): Classify {
  const baseUrl = (options.baseUrl ?? process.env.JEV_BASE_URL ?? '').replace(/\/+$/, '');
  const model = options.model ?? process.env.JEV_MODEL ?? '';
  const timeoutMs = options.timeoutMs ?? classifierTimeoutMs();
  const fetcher = options.fetch ?? fetch;

  return async (input) => {
    if (!baseUrl || !model) throw new ClassifierError('Set JEV_BASE_URL and JEV_MODEL, then restart the app.', true);
    const started = performance.now();
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}/v1/classifier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(classifierRequest(input, model)),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const name = (error as Error).name;
      // Node's fetch hides the system error (e.g. EHOSTUNREACH, ECONNREFUSED) in `cause`.
      const code = ((error as Error).cause as { code?: string } | undefined)?.code;
      throw new ClassifierError(name === 'TimeoutError' || name === 'AbortError'
        ? `Classifier did not answer within ${timeoutMs / 1000} s.`
        : `Could not reach the classifier at ${baseUrl}: ${(error as Error).message}${code ? ` (${code})` : ''}`, true);
    }
    const body = await response.json().catch(() => null);
    const latencyMs = Math.round(performance.now() - started);
    if (!response.ok) {
      const detail = (body as { error?: { message?: unknown }; detail?: unknown })?.error?.message ?? (body as { detail?: unknown })?.detail;
      const message = `Classifier returned HTTP ${response.status}${typeof detail === 'string' ? `: ${detail}` : '.'}`;
      throw new ClassifierError(message, response.status === 429 || response.status >= 500);
    }
    if (body === null) throw new ClassifierError('Classifier returned a response that is not JSON.');
    const answeredModel = (body as { model?: unknown }).model;
    return { result: parseClassifierResponse(body), model: typeof answeredModel === 'string' && answeredModel ? answeredModel : model, latencyMs };
  };
}
