// Local stand-in for simple-jev's /health and /v1/classifier. Answers are deterministic and fake.
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

export const testModel = 'paper-radar-test';
const labels = ['relevant', 'maybe', 'irrelevant'];
export const scenarios = ['ok', 'invalid-json', 'bad-label', 'bad-confidence', 'http-500', 'unknown-model'];

// Same title always gets the same answer: first hash byte picks the label, second the confidence 0.50–0.99.
export function expectedAnswer(title) {
  const hash = createHash('sha256').update(title).digest();
  return { choice: labels[hash[0] % 3], confidence: (50 + (hash[1] % 50)) / 100 };
}

export function startTestService({ port = 8765, log = () => {} } = {}) {
  const state = { scenario: 'ok', delayMs: 0, requests: 0, byTitle: {} };
  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  const invalid = (res, message) => send(res, 422, { error: { message, type: 'invalid_request_error', code: 422, param: null, details: [] } });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let raw = '';
    for await (const chunk of req) raw += chunk;

    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ready', model: testModel });
    if (req.method === 'GET' && url.pathname === '/stats') return send(res, 200, state);
    if (req.method === 'POST' && url.pathname === '/control') {
      const scenario = url.searchParams.get('scenario') ?? state.scenario;
      if (!scenarios.includes(scenario)) return send(res, 400, { error: `scenario must be one of: ${scenarios.join(', ')}` });
      state.scenario = scenario;
      if (url.searchParams.has('delayMs')) state.delayMs = Math.max(0, Number(url.searchParams.get('delayMs')) || 0);
      if (url.searchParams.has('reset')) Object.assign(state, { requests: 0, byTitle: {} });
      log(`control: scenario=${state.scenario} delayMs=${state.delayMs}`);
      return send(res, 200, state);
    }
    if (req.method !== 'POST' || url.pathname !== '/v1/classifier') return send(res, 404, { detail: 'Not Found' });

    let body;
    try { body = JSON.parse(raw); } catch { return invalid(res, 'Request body is not JSON.'); }
    const title = body?.state?.paper?.title;
    const question = body?.questions?.relevance;
    if (typeof title !== 'string' || typeof body.state.paper.abstract !== 'string') return invalid(res, 'state.paper needs a title and abstract.');
    if (question?.type !== 'choice' || JSON.stringify(Object.keys(question.criteria ?? {})) !== JSON.stringify(labels)) {
      return invalid(res, 'questions.relevance must be a choice with relevant, maybe, irrelevant criteria.');
    }
    state.requests++;
    state.byTitle[title] = (state.byTitle[title] ?? 0) + 1;
    if (state.delayMs) await new Promise((resolve) => setTimeout(resolve, state.delayMs));

    const answer = expectedAnswer(title);
    const probabilities = Object.fromEntries(labels.map((label) => [label, label === answer.choice ? answer.confidence : (1 - answer.confidence) / 2]));
    log(`#${state.requests} [${state.scenario}] ${title} -> ${answer.choice} ${answer.confidence.toFixed(2)}`);
    const ok = (relevance) => send(res, 200, { model: testModel, answers: { relevance: { type: 'choice', probabilities, ...relevance } }, usage: { input_tokens: 0, output_tokens: 0 } });
    switch (body.model === testModel ? state.scenario : 'unknown-model') {
      case 'invalid-json': return send(res, 200, '{"answers": ');
      case 'bad-label': return ok({ choice: 'very-relevant', confidence: answer.confidence });
      case 'bad-confidence': return ok({ choice: answer.choice, confidence: 1.7 });
      case 'http-500': return send(res, 500, 'Internal Server Error');
      case 'unknown-model': return invalid(res, `Loaded model is '${testModel}'`);
      default: return ok(answer);
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, state, url: `http://127.0.0.1:${server.address().port}` })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.TEST_CLASSIFIER_PORT) || 8765;
  const { url } = await startTestService({ port, log: (line) => console.log(line) });
  console.log(`Test classifier on ${url} (model ${testModel}). Scenarios: ${scenarios.join(', ')}`);
}
