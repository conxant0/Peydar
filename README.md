# Paper Radar

Local research topics show a deterministic query preview, discover candidate papers from OpenAlex or Semantic Scholar, and classify them through a simple-jev service (or a local test service).

## Start

Requires Node.js 22 or newer. From this directory:

```sh
npm ci
npm run db:init
npm run dev
```

Open <http://127.0.0.1:3001>. Port 3000 is occupied by another local app on this Mac. Paper Radar creates `data/paper-radar.sqlite` and applies migrations automatically; `db:init` lets you do that explicitly. No inference PC is needed for the query preview. Set `DATABASE_PATH` to use another SQLite file. `.env` is local and ignored by Git; `.env.example` documents the paper source, optional search keys, and the inference settings for later parts.

Create two topics using the form. The first can use the example in [the PRD](docs/Paper_Radar_PRD.md). Enter each interest in its own box and use **Add interest** for another; non-interests work the same way and are optional. Open a topic to inspect its fields, edit it, refresh, and restart the app to confirm persistence. Try a blank name and a blank interests box to see validation errors. Delete the second topic using the confirmation prompt; the first remains.

## Query preview

Open a topic to see the queries that will be used for discovery. The rule trims outer punctuation and collapses whitespace. It uses the first distinct interest as an anchor, pairs it with up to six later distinct interests in their entered order, then adds one question query and one description query. The question query pairs the anchor with the final phrase after `across`, `about`, `for`, `in`, `on`, `with`, `between`, or `among` when that phrase has at least two words. Otherwise it removes a leading question word and auxiliary verb, then uses the first seven words. The description query uses the first clause before a comma, period, semicolon, exclamation, or question mark, removes a leading `Research on` or `Study of`, and takes its first seven words. Empty queries and case-insensitive duplicates are removed; at most eight queries remain. Non-interests are excluded from positive searches.

For the [PRD example profile](docs/Paper_Radar_PRD.md#5-research-profile), the exact preview is:

```text
coding agents context management
coding agents agent memory
coding agents dependency tracking
coding agents stale context detection
coding agents parallel branches
context management for long-horizon coding agents
```

To verify, create or edit a topic to match the PRD example, open its page, and compare the preview with this list. Refresh and reopen it to confirm the order. Add `workflow repair` as a sixth interest; `coding agents workflow repair` should appear. Change `parallel branches` in the question to `parallel workflows`; the question query should change accordingly. Change the description's opening clause and check the final query. Repeated interests, extra whitespace, and trailing punctuation should add no empty or duplicate queries. Review whether the searches describe your topic before approving discovery work. Previously saved comma-separated interests remain in one box until you split them into separate boxes and save.

## Discovery

Open a topic and select **Discover papers**. Paper Radar runs each preview query against the configured paper source, asking for `ceil(50 / number of queries)` results per query. It keeps at most 50 new unique papers per run and skips remaining queries once it reaches that number. Each query's papers and topic associations are saved as soon as that query finishes, so a later failure or a stopped app keeps earlier results. OpenAlex sometimes lists one paper under several IDs; repeated titles within one response are dropped. A paper appears once globally and once per topic; running discovery again adds only papers the topic does not already have. Papers without abstracts stay in the list, marked as unclassified.

The page shows the last run: each query's status, how many results Semantic Scholar returned, how many papers were new, and an explanation when the topic has fewer than 20 candidates. Rate-limit (HTTP 429) and server errors are retried at most 3 times, waiting for `Retry-After` when the source sends it and 2, 4, then 8 seconds otherwise. After a query exhausts its retries on a rate limit, the rest of that run is skipped rather than retried. Run discovery again later to retry.

`PAPER_SOURCE` selects the source; restart the app after changing it.

- `openalex` (default) uses OpenAlex semantic search (`search.semantic`), which ranks by meaning rather than exact keywords and returns at most 50 results per query. Links go to the DOI when one exists, otherwise the OpenAlex page. Without a key, OpenAlex allows about $0.10 of usage per day at $0.001 per search, roughly 100 searches or a dozen discovery runs. A free account at <https://openalex.org> gives a key with $1 per day (about 1,000 searches); set it as `OPENALEX_API_KEY` in `.env` and restart the app.
- `semantic-scholar` uses Semantic Scholar's relevance search. Without a key, requests share a public rate limit and frequently fail with HTTP 429. Request a key at <https://www.semanticscholar.org/product/api#api-key-form> and set `SEMANTIC_SCHOLAR_API_KEY`.

Papers from the two sources have different IDs, so switching sources can list the same paper twice for a topic. Use a fresh `DATABASE_PATH` when switching if that matters. Requests in a run are spaced at least 1.1 seconds apart.

### Verification fixture

These commands use canned search responses and a separate database. They refuse to run unless `DATABASE_PATH` points somewhere other than `data/paper-radar.sqlite`.

```sh
export DATABASE_PATH=data/verify.sqlite
npm run fixture:discovery -- setup    # Fixture A and B share one paper; A has one paper without an abstract
npm run fixture:discovery -- check    # read-only: expect 1 row and 2 associations for fixture-shared, 0 duplicate pairs
npm run fixture:discovery -- partial  # A's second query fails after the first succeeded
npm run dev                           # inspect Fixture A, stop, start again: earlier papers and the failed query remain
npm run fixture:discovery -- retry    # the failed query succeeds; the other queries add nothing
npm run fixture:discovery -- check    # still 0 duplicate pairs; Fixture A has 10 candidates, Fixture B has 4
unset DATABASE_PATH
```

Fixture links point to `example.org` and are not real papers. To start over, stop the app and delete `data/verify.sqlite`.

## Classification

Open a topic and select **Classify N unfinished papers**. The Next.js server sends each paper that has an abstract, one at a time, to `JEV_BASE_URL/v1/classifier`. Each request carries the configured `JEV_MODEL`, the research profile and paper as `state`, and one `choice` question whose criteria are `relevant`, `maybe`, `irrelevant` in that order. The answer's `choice` and `confidence` are validated: only those three labels and a finite confidence from 0 to 1 are accepted. Each result is saved as soon as it arrives. The saved result includes the profile revision, the model the service reported, the prompt version (`relevance-choice-v1`), whether it came from the test service, and the request time measured on the Mac. Papers already classified for the topic are never sent again. Papers without abstracts are never sent.

The page shows progress while it works and saves each paper before starting the next. **Stop after this paper**, a page refresh, or stopping the app all interrupt the run. Completed results stay, and the button then offers the unfinished papers. A paper whose request fails shows the error and keeps no result. It is skipped for the rest of that run and retried the next time you press the button. An unreachable, overloaded (HTTP 429), failing (5xx), or timed-out service stops the run. `JEV_TIMEOUT_MS` sets the timeout, 60 s by default. A paper being sent is claimed until the timeout plus 30 s. If the app crashes mid-request, the claim expires and the paper becomes retryable.

### Test service

`npm run test-service` starts a fake simple-jev on <http://127.0.0.1:8765> with `/health`, `/v1/classifier`, `/stats`, and `/control`. It only answers model `paper-radar-test`. The same title always gets the same answer, and the service prints each answer it gives. `GET /stats` shows the total request count and requests per title. `POST /control` changes behavior until you change it back:

```sh
curl -X POST 'http://127.0.0.1:8765/control?delayMs=3000'        # delay every answer by 3 s
curl -X POST 'http://127.0.0.1:8765/control?scenario=bad-label'  # also: invalid-json, bad-confidence, http-500, unknown-model
curl -X POST 'http://127.0.0.1:8765/control?scenario=ok&delayMs=0'
curl http://127.0.0.1:8765/stats
```

`JEV_TEST_MODE=1` shows a banner on every page and marks each result as a test result. The app refuses to start in test mode against `data/paper-radar.sqlite`, so fake labels cannot enter the working database. Shell variables override `.env`, so the commands below leave your real settings untouched.

```sh
# Terminal 1
npm run test-service

# Terminal 2 (stop any running `npm run dev` first; only one dev server can run here)
export DATABASE_PATH=data/verify.sqlite
npm run fixture:discovery -- setup   # skip if data/verify.sqlite already has the fixture topics
JEV_TEST_MODE=1 JEV_BASE_URL=http://127.0.0.1:8765 JEV_MODEL=paper-radar-test npm run dev
```

## Browsing and saving

The topic page lists papers in two groups. **Classified** papers are ordered Relevant, Maybe, then Irrelevant, with higher confidence first; ties keep discovery order, so a refresh never reshuffles them. **Unclassified** papers (pending, failed, or missing an abstract) are listed separately and never counted as Irrelevant. The filter links show All, Relevant, Maybe, Irrelevant, or Saved; relevance filters include labels marked outdated. A label is outdated when the question, description, interests, or non-interests changed after it was produced. Renaming a topic does not make labels outdated.

**Save** keeps a paper for that topic only. The same paper in another topic keeps its own saved state. Saves survive restarts, reclassification, and profile edits. The topic list shows retrieved, scanned (papers with a stored label, including outdated ones), Relevant, Maybe, and saved counts. Browsing and saving never contact the classifier, so they work while it is offline.

### Verification fixture

```sh
export DATABASE_PATH=data/verify.sqlite
npm run fixture:browsing -- setup   # Browsing A: Relevant 0.90, Relevant 0.60, Maybe 0.99, Irrelevant 0.99, one without an abstract
npm run dev                         # Browsing B shares the Relevant 0.60 paper with A
npm run fixture:browsing -- check   # read-only: counts, order, and saved papers for both topics
unset DATABASE_PATH
```

The fixture labels are marked as test results. Running `setup` again keeps existing saves.

## Back up and restore

Stop the app before copying its database. Run these commands from the project directory:

```sh
mkdir -p backups
cp data/paper-radar.sqlite backups/paper-radar.sqlite
cp backups/paper-radar.sqlite data/verify-restore.sqlite
DATABASE_PATH=data/verify-restore.sqlite npm run dev
```

Open <http://127.0.0.1:3001> and check the restored topic. Stop the app, then run `npm run dev` to return to the original database. The restore check uses a separate file and does not overwrite your working data. Keep the backup outside this Mac as well if you need protection from disk loss.

## Developer checks

```sh
npm test
npm run typecheck
npm run build
```
