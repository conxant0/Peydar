# Paper Radar Implementation Plan

Source: [PRD v1.1](../Paper_Radar_PRD.md). Status: in progress; Part 1 completed and approved.

## Goal Description

Build a personal local research tool that persists topics and papers in SQLite,
retrieves papers from Semantic Scholar, and classifies them through the user's
PC-hosted simple-jev service. Deliver eight independently verifiable parts.

Each part ends with a working demonstration and the checks below. The developer
runs the relevant automated checks first, gives the user exact startup commands
and expected results, and stops. Only the user's explicit approval unlocks the
next part. Fixes to the current part remain in that part. Automated checks never
substitute for personal approval. There is no hard weekend deadline.

Part 1 is implemented. Commands, files, and screens for later parts are planned
deliverables, not capabilities already present in the repo.

## Acceptance Criteria

The negative cases below are operations that must be rejected or handled safely;
the automated tests asserting those outcomes must pass. Write the smallest
meaningful regression check before implementing each non-trivial rule.

| ID | Required outcome | Positive checks | Negative checks |
| --- | --- | --- | --- |
| AC-1 | Local topics and SQLite persistence | Create/read/edit/delete; all profile fields survive restart; restore a backup into a separate database | Invalid input cannot create a topic; deleting one topic does not delete another; migrations cannot erase existing records |
| AC-2 | Inspectable deterministic queries | Same normalized profile yields the same ordered, bounded query list; question, description, and interests contribute | Empty or repeated phrases do not produce empty or duplicate queries; deriving queries never calls a model |
| AC-3 | Real discovery with durable candidates | Real Semantic Scholar metadata and links; global paper uniqueness and per-topic associations; partial retrieval persists | Duplicate results cannot duplicate a paper/topic pair; missing abstracts and a later query failure cannot discard candidates |
| AC-4 | Replaceable, resumable classification | HTTP adapter maps requests and responses; each success persists; repeat runs skip completed papers | Missing abstracts are never sent; bad labels/confidence cannot replace data; interruption leaves unfinished work retryable; test output cannot enter real results |
| AC-5 | Useful browsing and saved papers | Correct label/confidence ordering, all required filters/card fields/counts; topic-specific saves survive restart | Double-saving cannot duplicate records; save state cannot leak across topics; classifier outage cannot block existing results |
| AC-6 | Safe edits and recovery | Profile edits visibly invalidate old labels; successful explicit reclassification replaces them; failed work can be retried | Rename-only edits do not invalidate results; failed replacement or obsolete in-flight work cannot overwrite a newer result; retries cannot duplicate successful work |
| AC-7 | Real simple-jev integration | Configure PC URL and model ID; health and classification work from Mac; real metadata and timings persist | Bad URL/model, service outage, malformed response, and unsupported input length produce actionable errors without test fallback |
| AC-8 | Reproducible manual evaluation | Approximately 50 papers labeled without visible predictions; stable report with accuracy, per-class precision/recall/F1, latency, and severe misses | Test/outdated results cannot silently enter an evaluation; incomplete predictions cannot pass the gate; zero denominators cannot imply perfect quality; 30% severe misses rejects the model |

Quantitative requirements are already agreed: 20–50 candidates is a retrieval
target, about 50 labels is the initial evaluation target, and a severe-miss rate
of **30% or more is the user's rejection threshold**. No latency target is
invented: latency is measured and reported.

## Path Boundaries

### Upper Bound (Maximum Scope)

Complete the PRD's local, single-user workflow, documented setup and backup,
fault recovery, and one manually labeled evaluation. Include a compact local
test service and repeatable demo data where necessary to verify behavior.

### Lower Bound (Minimum Scope)

All eight acceptance criteria work with real retrieval and real local inference.
Use simple forms, a topic list, a topic results screen with expandable abstracts,
and a small manual-labeling/report view. Test-service demonstrations alone cannot
complete the MVP. An honestly reported poor model result can complete the
experiment; it cannot pass the model usefulness threshold.

### Allowed Choices

- Next.js and TypeScript on the Mac; SQLite accessed only by the server.
- Standard HTTP requests to Semantic Scholar and simple-jev. A small adapter is
  sufficient; no extra inference wrapper service is required.
- Choose a supported Node runtime and compatible SQLite access library during
  Part 1, verify their current documentation, and pin dependencies in a lockfile.
  Prefer direct database operations and migrations over a generic repository layer.
- Add schema and application files when their part needs them. Suggested locations
  are `src/app/`, `src/lib/`, `db/migrations/`, and small `scripts/`/`tests/` folders;
  these are boundaries, not instructions to scaffold empty directories.
- Keep `.env` and other local environment files, database files, database sidecars, backups, and local evaluation
  exports out of Git. Document configuration with an `.env.example` and README.
- Excluded: Supabase, authentication, cloud inference, scheduling, RAG, PDF parsing,
  summaries, chat, training, model-comparison dashboards, and other PRD non-goals.
- No separate queue service, generic provider framework, or dedicated paper-detail
  page is needed for this MVP. Revisit only if a measured requirement demands one.

## Feasibility Hints and Suggestions

### Conceptual Approach

Keep UI actions small: validate input, call an ordinary server function, persist
the result, and refresh the view. External API and database operations stay on
the server. Process papers sequentially in awaited, bounded work units and persist
each success. Do not rely on detached background work surviving a request or
restart. Interrupted work can stop; it must remain available for explicit retry.

Use database uniqueness constraints for global Semantic Scholar IDs and per-topic
paper/classification/save pairs. Enforce relationships with foreign keys. A topic
deletion removes its associations and results but preserves papers used elsewhere.
Do not delete globally shared papers merely because one topic is removed.

Capture the profile revision when a classification starts. Commit a response only
if it cannot overwrite a result for a newer revision. Changes during processing
must not make an old response appear current. Keep successful results separate
from the latest failed attempt so replacement failure never destroys an old label.

Use a separate local verification database for fixtures and test-service results.
Show a persistent test-mode indicator. Do not migrate its fake classifications
into the real database when connecting the PC. Reuse the same HTTP adapter against
the test service and real service so the integration checks are meaningful.

### Implementation Defaults

These resolve minor gaps without adding product scope:

- Require nonblank name, question, and description; require at least one interest.
  Non-interests can be an empty list. Trim entries and remove empty entries.
- Use one interest/non-interest per line in the forms. Do not add a tag-editor dependency.
- Treat "scanned" as the number of successfully classified papers for the topic,
  including retained outdated results. Show retrieved/pending counts separately
  and identify outdated results/counts explicitly.
- Relevance filters include the stored labels, including visibly outdated labels.
  Pending, failed-without-result, and missing-abstract papers appear in a separate
  unclassified group and never masquerade as Irrelevant.
- Save is scoped to a topic. A save survives reclassification and profile edits.
- Use stable tie-breaking after relevance and descending confidence so refreshes
  do not randomly reorder equivalent results.
- A page refresh or stopped app may interrupt discovery/classification. Completed
  work remains; the user explicitly retries. Continuous background processing is
  not an acceptance requirement.

### Relevant References

- [PRD](Paper_Radar_PRD.md): product contract and exclusions.
- [simple-jev](https://github.com/featherless-ai/simple-jev): initial local service.
- [simple-jev API reference](https://github.com/featherless-ai/simple-jev/blob/main/hf-server/API_REFERENCE.md): verify against the installed version during Part 7.
- Semantic Scholar's official API documentation: consult in Part 3 before choosing
  endpoint parameters, pagination, and rate-limit behavior.

## Dependencies and Sequence

| Part | Depends on | External prerequisite | Gate |
| --- | --- | --- | --- |
| 1. Topics and storage | None | Local Node/package setup | AC-1 |
| 2. Query preview | Approved Part 1 | None | AC-2 |
| 3. Discovery | Approved Part 2 | Semantic Scholar access; API key if required for the chosen access | AC-3 |
| 4. Classification plumbing | Approved Part 3 | Local test service built in this part | AC-4 |
| 5. Browsing and saving | Approved Parts 4 and 7 in the current sequence | None | AC-5 |
| 6. Edits and recovery | Approved Part 5 | None | AC-6 |
| 7. Connect PC | Approved Part 4 | Configured URL/model; verify installed classification API behavior | AC-7 |
| 8. Evaluation | Approved Parts 1–7 | User's manual labels and real model predictions | AC-8 |

Current sequence: **1 → 2 → 3 → 4 → 7 → 5 → 6 → 8**. Keep the original part
numbers for traceability to the PRD. The PC is now set up: its health endpoint
reported ready over HTTP with `Qwen/Qwen3.5-0.8B`. The supplied HTTPS URL failed
its TLS handshake; `.env` uses the verified HTTP URL. Health readiness does not
prove classification compatibility, performance, or accuracy; Part 7 remains pending.

Parts 1–6 can still be implemented without the PC. If it becomes unavailable,
the user may approve returning to the original sequence, with Part 7 after Part 6.
Final evaluation still waits for all other gates. If external access is
unavailable, report the specific blocked check; do not mark that gate passed
using fixtures or start dependent parts without approval.

### Part 1 — Local topics and storage

**Build:** Initialize the application and local configuration, create the topic
migration and profile revision field, implement topic forms/list/detail and
validation, and document startup plus backup/restore. Start the local app on
loopback. Keep the visual treatment simple but readable, keyboard accessible,
and equipped with labeled inputs and clear loading/error states.

**Developer verification:** A temporary-database check covers migration reruns,
topic persistence and isolation, invalid input, and revision changes. Run the
build/type checks. Back up a stopped verification database and restore it into
a separate location; never overwrite the user's working database to test restore.

**Your steps:**

1. Follow the delivered README to install, initialize the database, and start the app.
2. Create Topic A using the PRD's example and Topic B with visibly different fields.
3. Open A and verify every field. Edit its description and interests; refresh.
4. Stop and restart the app. Both topics and the edits must still exist.
5. Try an empty name and an empty interest list. The form must explain the error
   and must not create a partial topic.
6. Delete B through the confirmation flow. A must remain unchanged after refresh.
7. Follow the backup/restore instructions using the separate restore path. Start
   against the restored copy and verify A's fields, then return to the original.

**Pass:** All steps match their expected outcomes without the PC or hosted database.
Record approval for Part 1 before Part 2 begins.

### Part 2 — Deterministic query preview

**Build:** Implement one pure query-derivation function. Normalize whitespace,
combine interest phrases with concise question/description phrases, deduplicate,
and cap the query list. Document the exact chosen rule and show the resulting
queries on the topic page. No LLM, semantic retrieval, or phrase-extraction service.

**Developer verification:** Before implementing, choose a fixed profile and exact
expected query list. Check repeatability, punctuation/whitespace, duplicate
interests, bounded output, and empty optional lists. Each input source must have
a case showing its contribution. Do not snapshot an output without reviewing it.

**Your steps:**

1. Open A's query preview and compare it with the supplied expected list.
2. Refresh and reopen it. Query text and order must remain identical.
3. Add an interest used by the documented rule. Verify the expected new query.
4. Change a question/description phrase used by that rule and check the preview.
5. Add repeated entries and extra whitespace. No empty or duplicate queries appear.
6. Read the queries for usefulness: they should describe the actual research topic.
   If they are mechanically valid but poor searches, refine this part before approval.

**Pass:** Deterministic checks pass and you approve the queries as a reasonable
starting point for real retrieval. Retrieval quality is checked in Part 3.

### Part 3 — Real discovery and durable candidates

**Build:** Add paper and topic-paper tables, a server-side Semantic Scholar client,
and an explicit Discover action. Implement bounded multi-query retrieval targeting
20–50 unique papers, metadata normalization, and incremental persistence. Render
a basic candidate list with source links and processing status. Handle empty
responses, partial failure, and rate limits now, including bounded retries and
respect for service retry guidance. Never retry indefinitely.

**Developer verification:** Use canned API responses for duplicate IDs across
queries/topics, missing metadata, empty results, a rate-limit response, and a
later query failing after earlier success. Verify actual DB constraints, not just
UI counts. Provide a small repeatable discovery fixture for personal verification
when live search results cannot reproduce an edge case.

**Your steps:**

1. Discover papers for A against the real API. Inspect the queries, retrieved
   count, and any explanation for fewer than 20 results.
2. Open three original links and compare titles/authors/year with the displayed data.
3. Repeat discovery. Existing paper IDs must not create duplicate cards; new API
   results may legitimately add papers, so an identical total is not required.
4. Use the provided overlap fixture with A and B in the verification database.
   The supplied read-only check must report one global paper and two associations.
5. Inspect the missing-abstract fixture. It remains visible as unclassified.
6. Trigger the supplied partial-failure example, then restart. Earlier retrieved
   papers remain, the failed query is reported, and retry creates no duplicates.

**Pass:** Live retrieval works and the repeatable failure cases preserve candidates.

### Part 4 — Classification plumbing and repeatable test service

**Build:** Add classification persistence, response validation, profile-revision
capture, provenance, request timing, and the HTTP adapter. The adapter sends one
simple-jev choice question with stable candidate order and maps its answer to the
PRD result contract. Provide a tiny local HTTP test service exposing `/health`
and `/v1/classifier`, deterministic labels, request counts, delays, and failure
responses. Document `JEV_BASE_URL`, `JEV_MODEL`, test mode, and the
separate verification database. Add visible progress and retry of unfinished work.

**Developer verification:** Test exact request/response mapping, invalid JSON,
unexpected labels, out-of-range confidence, timeout, missing abstracts, and
idempotence. Prevent duplicate active work for the same topic/paper. Use bounded
claims or equivalent recovery so a crash cannot leave work permanently locked.
Persist model/configuration identity and client-observed request duration.

**Your steps:**

1. Start the documented test service and verification app. Confirm the test-mode
   banner before submitting anything.
2. Load the supplied papers and classify them. Compare labels/confidences with
   the service's documented responses; confirm progress reaches completion.
3. Refresh/restart and verify results persist. Repeat classification and compare
   the service's request counter: completed papers must not be requested again.
4. Verify the paper without an abstract was never sent to the service.
5. Use delayed responses; interrupt processing after two successes. Reopen the
   app and verify those results remain, then retry only unfinished papers.
6. Select an invalid response scenario. The app shows the failure without storing
   a fake successful result. Correct the scenario and retry successfully.

**Pass:** Integration and recovery work through real HTTP calls to the test service.
This establishes plumbing only, not model quality or real-PC compatibility.

### Part 5 — Browsing, sorting, and saving

**Build:** Complete paper cards, expanded abstracts, Relevant/Maybe/Irrelevant/Saved
filters, relevance-first/confidence-second ordering, and topic counts. Add save
persistence with unique topic-paper pairs. Distinguish retrieved, scanned, pending,
failed, missing-abstract, and outdated information without inventing extra labels.

**Developer verification:** Provide four classified fixture papers: Relevant 0.90,
Relevant 0.60, Maybe 0.99, Irrelevant 0.99, plus one missing an abstract. Test sort
order, filters, repeated save/unsave, and cross-topic isolation with DB-backed checks.

**Your steps:**

1. Load the fixture. Expected classified order is Relevant 0.90, Relevant 0.60,
   Maybe 0.99, then Irrelevant 0.99. The unclassified paper is separately identified.
2. Select each relevance filter: expect 2 Relevant, 1 Maybe, and 1 Irrelevant.
3. Save Relevant 0.60 and Maybe 0.99. Saved must show exactly those two papers.
4. Check the dashboard: 5 retrieved, 4 scanned, 2 Relevant, 1 Maybe, 2 saved.
5. Refresh/restart, then unsave one. Saved must show one paper and the count must agree.
6. Associate the same paper with another topic. Saving in A must not save it in B.
7. Turn off the test service. All stored cards, filters, abstracts, links, and
   save/unsave must remain usable. Tab through controls to verify keyboard access.

**Pass:** The complete browsing workflow matches known results and works offline
from inference. No dedicated paper page is required.

### Part 6 — Profile edits and complete recovery

**Build:** Finish visible outdated-state handling and explicit reclassification.
Preserve old results until validated replacements commit. Complete failure messages,
retry controls, in-flight revision handling, and delete behavior for populated topics.
Reuse existing logic and the test service; do not create a second processing path.

**Developer verification:** Regression checks cover rename-only versus substantive
edits, delayed responses racing profile edits, failed replacements, duplicate
submissions, process interruption, and topic deletion during work. Ensure every
PRD failure type has a reproducible case. Checks introduced earlier remain in place.

**Your steps:**

1. Classify A, note labels/saves, then rename A. Labels must remain current.
2. Change its question. Existing labels remain visible but become outdated;
   no classification requests are issued merely because the edit was saved.
3. Request reclassification explicitly with successful test responses. Replaced
   results become current, and saves remain unchanged.
4. Edit an interest and force a replacement failure. The old label/confidence
   remains visible and outdated alongside a retryable error. Retry successfully.
5. Start delayed classification, edit the profile before the answer returns, then
   inspect the result. It cannot appear current for the new profile or overwrite
   a result already produced for that newer profile.
6. Follow the supplied empty-search, 429, retrieval-failure, timeout, and malformed
   response scenarios. Check the error and retained data in each case.
7. Start a delayed request, delete that topic, and let the request finish. It must
   not resurrect the topic or its associations; papers/results under B remain.

**Pass:** Errors are understandable, retries recover, and edits never silently
misrepresent old classifications as current.

### Part 7 — Connect your real simple-jev service

**Build:** Use the user's URL and exact served model ID. Confirm the installed
service contract and context limits, adjust only the adapter/configuration as
needed, and exercise the real service. Use the real database with test mode off.
No automatic fallback to hosted inference or fake labels. Overlength input must
fail visibly; do not silently truncate research profiles or abstracts.

**Developer verification:** Provide exact Mac-side health and sample classification
commands using the supplied configuration. Validate a real response and persistence.
Record the simple-jev version, model identity, application prompt/configuration
version, and measured request latency. Treat latency as a measurement, not a promise.

**Your steps:**

1. Use the configured `JEV_BASE_URL` and `JEV_MODEL` in `.env` (or copy `.env.example` on a new machine);
   select the real database, disable test mode, and restart the app.
2. Run the delivered health command from the Mac. It must reach the PC service.
3. Classify three real papers with abstracts. Inspect the three permitted labels,
   confidence range, stored model identity, and request timings.
4. Restart the app and repeat processing. Completed real results are retained and skipped.
5. Stop the PC service. Browse/save existing papers and try new classification.
   Browsing still works; classification shows an availability error without fake results.
6. Restart the service and retry. Only unfinished work resumes. Exercise the
   delivered bad-model and overlength examples and confirm actionable errors.

**Pass:** Real local inference works with the same application workflow and preserves
data during outages. Three examples demonstrate connectivity, not model usefulness.

### Part 8 — Manual evaluation and usefulness decision

**Build:** Add a simple labeling view and report using approximately 50 real papers
with abstracts. Freeze the selected profile/paper inputs, predictions, model/config
identity, and timings for that evaluation. Hide predictions/confidence while labeling;
persist human labels for interruption/resumption. Do not require a model-comparison UI.

Report accuracy, per-class precision/recall/F1, class counts, confusion counts,
average successful client-observed classification request latency, failed/pending
prediction counts, and the exact severe-miss numerator/denominator. Request latency
includes HTTP overhead; do not label it GPU-only inference time. Separate
Relevant-to-Maybe mistakes from Relevant-to-Irrelevant mistakes. Display undefined
metrics as unavailable with their denominator rather than inventing favorable scores.

**Developer verification:** Use this six-row deterministic metric example:

| Human label | Predicted label | Request latency |
| --- | --- | --- |
| Relevant | Relevant | 100 ms |
| Relevant | Irrelevant | 200 ms |
| Maybe | Maybe | 300 ms |
| Maybe | Relevant | 400 ms |
| Irrelevant | Irrelevant | 500 ms |
| Irrelevant | Maybe | 600 ms |

Expected: accuracy 50%; each class's precision, recall, and F1 is 0.50; average
latency 350 ms; severe misses 1/2 = 50%, which rejects the model. Also check 2/10
severe misses is below the threshold, 3/10 rejects, no Relevant examples gives an
undefined rate, and missing predictions prevent a completed result. These synthetic
metric checks must never be presented as a real model evaluation.

**Your steps:**

1. Select approximately 50 real papers for one fixed profile and model configuration.
   If a run yields too few suitable papers, retrieve additional candidates first.
2. Label each Relevant, Maybe, or Irrelevant with predictions hidden. Label a few,
   restart, and verify your progress survives before finishing the set.
3. Resolve missing/failed real predictions; the report must clearly remain incomplete
   until the selected set has both human labels and valid model predictions.
4. Open the report. Check total and per-class counts against your labeled set.
5. Open every human-Relevant/model-Irrelevant disagreement and inspect the original
   profile, paper, and labels. Compare the reported fraction to the actual count.
6. Verify the six-row metric example using the separate verification data.
7. Edit the live topic or reclassify a paper. The frozen evaluation must not change.

**Pass:** The report is correct, reproducible, and based on real inference and your
labels. Record the model outcome separately: reject at >=30% severe misses; below
that threshold means only that this rejection rule was not triggered. Always show
the sample size, especially when very few papers were human-labeled Relevant.

## Task Breakdown

Routing tags describe task type; this plan does not launch another agent or an
automatic implementation/review loop. The current implementation agent owns the
coding tasks. User verification is governed by the milestone gates above.

| Task ID | Description | Target AC | Tag | Depends On |
| --- | --- | --- | --- | --- |
| T1 | Local application, topic persistence, validation, migrations, backup/restore, and checks | AC-1 | coding | None |
| T2 | Query derivation, preview, and exact deterministic checks | AC-2 | coding | T1 and user approval |
| T3 | Real discovery, durable associations, API failure checks, and discovery fixtures | AC-3 | coding | T2 and user approval |
| T4 | HTTP adapter, test service, durable classifications, progress/retry, and checks | AC-4 | coding | T3 and user approval |
| T5 | Cards, filters, sorting, counts, saved state, and checks | AC-5 | coding | T4, T7, and user approval in the current sequence |
| T6 | Outdated results, replacement safety, in-flight recovery, and regression checks | AC-6 | coding | T5 and user approval |
| T7 | Real PC connection, configuration, smoke checks, and outage verification | AC-7 | coding | T4 and user approval |
| T8 | Frozen evaluation, blind labeling, metrics, report, and known-answer checks | AC-8 | coding | T1–T7 and user approval |

## Planning Review

This is a single-agent plan based on the PRD and the user's accepted decisions.
No Claude–Codex deliberation or independent review was performed or is claimed.
The plan has been checked for PRD coverage and dependency consistency. Part 1
has been approved; existing decisions are carried forward rather than reopened.

## Pending User Decisions

No new product decision blocks Part 2. The PC URL and model ID have been supplied
and saved locally; installed simple-jev classification behavior is checked in Part 7. Before Part 8,
the user provides manual labels. Before each subsequent part, the user verifies
and approves the preceding part. Package/runtime choices and minor UI details are
implementation choices within this plan, not separate approval gates.

## Implementation Notes

- Keep plan labels such as AC-1, Part 1, or T1 in documentation, not application
  names, source comments, or user-facing screens. Use domain names in code.
- Add focused executable checks for the logic under change; do not build a broad
  custom test framework. Real API calls complement deterministic local checks.
- At each handoff, include the exact command to start the app/test service, URL,
  verification data setup, expected results, automated check outcomes, and known
  limitations. Commands must work on the user's actual environment when delivered.
- Verification fixtures must target only the separate verification database.
  Any reset command must refuse the real database path.
- Preserve unrelated repository changes. Do not push, publish, or modify the user's
  PC setup as an implied part of a local verification gate.

### Part 1 handoff

- Local stack: Node 22, Next.js 16.3.6, React 19.3.0, better-sqlite3 13.0.3;
  exact dependencies are in `package-lock.json`. Run `npm ci`, `npm run db:init`,
  then `npm run dev` at `http://127.0.0.1:3001` (port 3000 is occupied locally).
- `src/lib/db.ts` opens the configurable `DATABASE_PATH` (default
  `data/paper-radar.sqlite`) and applies `db/migrations/001_topics.sql` once.
  `src/lib/topics.ts` owns validation and CRUD. Substantive profile edits bump
  `profile_revision`; rename-only edits do not. Keep using these operations in
  later parts rather than adding a second topic path.
- The topic list, detail page, form, and server actions are in `src/app/`.
  Part 2 should add one pure query function with an exact expected-output check,
  then render its preview on the existing topic detail page.
- `npm test` covers persistence across reopen, topic isolation, invalid input,
  revisions, repeat migration, and copying a stopped database to a separate
  restore path. `npm run build` and local HTTP responses for `/` and
  `/topics/new` also passed. README documents the personal backup/restore check.
- Part 1 has no papers or query derivation yet. Keep fixtures and future test
  data in a separate verification database; do not reset the working database.

## Verification Ledger

Update this only after actual implementation and user verification. A developer
check passing is not user approval. Record the date and evidence of each approval.

| Part | Developer checks | User verification | Approval/date |
| --- | --- | --- | --- |
| 1 | Passed `npm test`, `npm run build`, and local page checks; stopped-database restore checked in a temporary path | User requested that Part 1 be marked completed and verified in chat; individual manual step results were not recorded | Approved 2026-09-23 |
| 2 | Passed `npm test`, `npm run typecheck`, `npm run build`, and local HTTP query-preview check against a separate temporary database; expected six queries rendered in order | Not performed | Pending |
| 3 | Not started | Not performed | Pending |
| 4 | Not started | Not performed | Pending |
| 5 | Not started | Not performed | Pending |
| 6 | Not started | Not performed | Pending |
| 7 | Not started | Not performed | Pending |
| 8 | Not started | Not performed | Pending |
