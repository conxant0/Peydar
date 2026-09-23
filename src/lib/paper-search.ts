export type PaperMetadata = {
  id: string;
  title: string;
  abstract: string | null;
  authors: string[];
  year: number | null;
  publicationDate: string | null;
  venue: string | null;
  url: string;
  citationCount: number | null;
};

export type SearchPapers = (query: string, limit: number) => Promise<PaperMetadata[]>;

export class SearchError extends Error {
  rateLimited: boolean;
  constructor(message: string, rateLimited = false) {
    super(message);
    this.rateLimited = rateLimited;
  }
}

type Options = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  apiKey?: string;
  retries?: number;
};

const maxWaitMs = 30_000;

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const count = (value: unknown) => Number.isInteger(value) && (value as number) >= 0 ? value as number : null;

export const sources = {
  'openalex': { name: 'OpenAlex', keyVariable: 'OPENALEX_API_KEY' },
  'semantic-scholar': { name: 'Semantic Scholar', keyVariable: 'SEMANTIC_SCHOLAR_API_KEY' },
} as const;

export type SourceId = keyof typeof sources;

export function paperSource(): SourceId {
  const id = process.env.PAPER_SOURCE || 'openalex';
  if (!(id in sources)) throw new Error(`PAPER_SOURCE must be one of: ${Object.keys(sources).join(', ')}.`);
  return id as SourceId;
}

export function normalizeSemanticScholar(raw: unknown): PaperMetadata | null {
  if (!raw || typeof raw !== 'object') return null;
  const paper = raw as Record<string, unknown>;
  const id = text(paper.paperId);
  const title = text(paper.title);
  if (!id || !title) return null;
  const authors = Array.isArray(paper.authors)
    ? paper.authors.map((author) => text((author as { name?: unknown })?.name)).filter((name): name is string => !!name)
    : [];
  return {
    id,
    title,
    abstract: text(paper.abstract),
    authors,
    year: count(paper.year),
    publicationDate: text(paper.publicationDate),
    venue: text(paper.venue),
    url: text(paper.url) ?? `https://www.semanticscholar.org/paper/${encodeURIComponent(id)}`,
    citationCount: count(paper.citationCount),
  };
}

// OpenAlex sends abstracts as { word: [positions] }.
function invertedAbstract(index: unknown) {
  if (!index || typeof index !== 'object') return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    if (Array.isArray(positions)) positions.forEach((position) => { if (Number.isInteger(position) && position >= 0) words[position] = word; });
  }
  return text(words.filter(Boolean).join(' '));
}

export function normalizeOpenAlex(raw: unknown): PaperMetadata | null {
  if (!raw || typeof raw !== 'object') return null;
  const work = raw as Record<string, any>;
  const id = text(work.id)?.replace(/^https:\/\/openalex\.org\//, '');
  const title = text(work.display_name) ?? text(work.title);
  if (!id || !title) return null;
  return {
    id,
    title,
    abstract: invertedAbstract(work.abstract_inverted_index),
    authors: Array.isArray(work.authorships)
      ? work.authorships.map((item: any) => text(item?.author?.display_name)).filter((name: string | null): name is string => !!name)
      : [],
    year: count(work.publication_year),
    publicationDate: text(work.publication_date),
    venue: text(work.primary_location?.source?.display_name),
    url: text(work.doi) ?? `https://openalex.org/${encodeURIComponent(id)}`,
    citationCount: count(work.cited_by_count),
  };
}

function retryDelay(response: Response, attempt: number) {
  const seconds = Number(response.headers.get('retry-after'));
  return Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 2000 * 2 ** attempt, maxWaitMs);
}

export function createSearch(source: SourceId = paperSource(), options: Options = {}): SearchPapers {
  const fetcher = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const { name, keyVariable } = sources[source];
  const apiKey = options.apiKey ?? process.env[keyVariable];
  const retries = options.retries ?? 3;

  const request = (query: string, limit: number) => source === 'openalex'
    ? {
      url: `https://api.openalex.org/works?${new URLSearchParams({
        'search.semantic': query, per_page: String(limit),
        select: 'id,doi,display_name,publication_year,publication_date,authorships,primary_location,cited_by_count,abstract_inverted_index',
        ...(apiKey ? { api_key: apiKey } : {}),
      })}`,
      headers: {} as Record<string, string>,
    }
    : {
      url: `https://api.semanticscholar.org/graph/v1/paper/search?${new URLSearchParams({
        query, limit: String(limit), fields: 'title,abstract,authors,year,publicationDate,venue,url,citationCount',
      })}`,
      headers: (apiKey ? { 'x-api-key': apiKey } : {}) as Record<string, string>,
    };

  const parse = (body: unknown) => {
    const list = source === 'openalex' ? (body as { results?: unknown })?.results : (body as { data?: unknown })?.data;
    if (!body || (list !== undefined && !Array.isArray(list))) throw new SearchError(`${name} returned an unreadable response.`);
    const papers = ((list ?? []) as unknown[]).map(source === 'openalex' ? normalizeOpenAlex : normalizeSemanticScholar)
      .filter((paper): paper is PaperMetadata => !!paper);
    // OpenAlex can list one paper under several work IDs (e.g. preprint and repository copies).
    const titles = new Set<string>();
    return papers.filter((paper) => !titles.has(paper.title.toLowerCase()) && !!titles.add(paper.title.toLowerCase()));
  };

  return async (query, limit) => {
    const { url, headers } = request(query, limit);
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await fetcher(url, { headers, signal: AbortSignal.timeout(20_000) });
      } catch (error) {
        if (attempt < retries) { await sleep(2000 * 2 ** attempt); continue; }
        throw new SearchError(`Could not reach ${name}: ${(error as Error).message}`);
      }
      if (response.ok) return parse(await response.json().catch(() => null));
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < retries) { await sleep(retryDelay(response, attempt)); continue; }
      if (response.status === 429) {
        throw new SearchError(`${name} rate limit reached after ${attempt + 1} attempts.${apiKey ? '' : ` Setting ${keyVariable} raises the limit.`}`, true);
      }
      throw new SearchError(`${name} returned HTTP ${response.status}${attempt ? ` after ${attempt + 1} attempts` : ''}.`);
    }
  };
}
