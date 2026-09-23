# Paper Radar --- Product Requirements Document

**Status:** MVP Source of Truth\
**Version:** 1.2 (OpenAlex added as a paper source)\
**Target:** Incremental personal MVP; no hard weekend time budget\
**Primary user:** Personal research use

## 1. Product Overview

Paper Radar is a personal web application for discovering academic
papers relevant to a specific research topic.

The user defines a research profile. Paper Radar deterministically
derives search queries from that profile, retrieves candidate papers
from OpenAlex or Semantic Scholar, and sends each candidate's title and abstract to
a locally hosted classifier. The classifier labels each paper as
**Relevant**, **Maybe**, or **Irrelevant**, with a confidence score.

The core pipeline is:

`Research Profile → Query Derivation → OpenAlex / Semantic Scholar → Candidate Papers → Local Classifier → Filtered Dashboard`

The MVP is intentionally focused on **retrieval + classification**, not
paper summarization or question answering.

## 2. Goals

The MVP must:

1.  Let the user define and persist multiple research topics.
2.  Discover candidate papers using OpenAlex or Semantic Scholar.
3.  Automatically derive search queries from the research profile
    without requiring an LLM.
4.  Classify candidate papers using a locally hosted open-source model.
5.  Present papers grouped or sortable by relevance.
6.  Allow papers to be saved for later reading.
7.  Provide enough classification data to evaluate whether a small local
    model is useful for relevance filtering.
8.  Evaluate local structured classification, initially using simple-jev.
    A local classifier satisfying the product contract is acceptable;
    reproducing TypeSafe Jev itself is not a requirement.

## 3. Non-Goals

The MVP will **not** include:

-   Authentication or multi-user support
-   RAG
-   PDF parsing or full-text ingestion
-   Paper summarization
-   Chat-with-paper functionality
-   Autonomous agents
-   Recommendation algorithms
-   Citation graph exploration
-   Automated scheduled searches
-   Cloud-hosted model inference
-   Training or fine-tuning a model
-   Continuous ingestion of all new academic papers

These may be considered after the MVP.

## 4. Primary User Flow

1.  User opens Paper Radar.
2.  User creates a research topic.
3.  User provides:
    -   research question
    -   description
    -   interests
    -   non-interests
4.  Paper Radar derives search queries deterministically from the
    profile.
5.  Paper Radar searches the configured paper source (OpenAlex or
    Semantic Scholar).
6.  Candidate papers are deduplicated and persisted with their topic
    associations before classification begins.
7.  Each candidate with an abstract has its title and abstract sent to
    the local classification service. Missing abstracts remain visible
    with an explicit unclassified status.
8.  Classifier returns:
    -   relevance label
    -   confidence
9.  Each successful classification is persisted as it completes.
10. User views the research topic dashboard.
11. User filters/sorts papers and optionally saves papers for later
    reading.

## 5. Research Profile

### Required fields

``` ts
type ResearchTopic = {
  id: string;
  name: string;
  question: string;
  description: string;
  interests: string[];
  nonInterests: string[];
  createdAt: Date;
  updatedAt: Date;
};
```

Example:

``` json
{
  "name": "Branch-Aware Context Management",
  "question": "How can AI coding agents manage context across parallel branches?",
  "description": "Research on context management for long-horizon coding agents, particularly synchronization and selective information sharing across parallel work.",
  "interests": [
    "coding agents",
    "context management",
    "agent memory",
    "dependency tracking",
    "stale context detection"
  ],
  "nonInterests": [
    "generic RAG",
    "human conversational branching"
  ]
}
```

### Editing and reclassification

Changes to the question, description, interests, or non-interests mark
existing classifications as outdated. Changing only the topic name does
not. Preserve the profile revision used for each classification so the
application can determine whether its result is current.

Outdated results remain browsable with a visible indicator. Profile edits
do not automatically trigger reclassification. The user must explicitly
request it, and each old result is replaced only after its replacement
has succeeded and passed validation. Failed attempts preserve old results.

## 6. Candidate Paper Discovery

### Source

The MVP supports two academic paper sources. One configured source is
used at a time (`PAPER_SOURCE`):

-   **OpenAlex API** (default). Uses OpenAlex semantic search. Added
    because Semantic Scholar's shared public rate limit rejected every
    unauthenticated request during development. A free OpenAlex API key
    raises the daily usage budget.
-   **Semantic Scholar API**. Uses relevance search. An API key is
    effectively required for reliable access.

Only these two sources are in scope; combining results from both in one
run is not.

The application should retrieve useful available metadata such as:

-   source paper ID (OpenAlex work ID or Semantic Scholar paper ID)
-   title
-   abstract
-   authors
-   publication year/date when available
-   venue when available
-   paper URL
-   citation count when available

Missing optional metadata must not prevent classification.

### Query derivation

MVP query generation must be **deterministic** and must not call a
generative LLM.

Queries should be constructed from combinations of:

-   research question
-   interests
-   key phrases from the research description

The implementation may normalize and combine these fields into a small
set of concise queries.

Example:

Research profile:

``` text
Question: How can AI coding agents manage context across parallel branches?

Interests:
coding agents
context management
agent memory
dependency tracking
```

Possible derived queries:

``` text
coding agents context management
coding agents agent memory
parallel coding agents
dependency-aware context
```

### Retrieval requirements

-   Run multiple derived queries against the configured paper source.
-   Show the derived queries before the user starts discovery.
-   Merge results.
-   Deduplicate using the source paper ID.
-   Persist candidates and their topic associations independently of
    classification, including candidates missing abstracts.
-   Do not classify a paper twice for the same research topic unless
    reclassification is explicitly triggered.
-   The initial MVP should target approximately **20--50 unique
    candidate papers per discovery run** rather than maximizing
    retrieval volume. Fewer results are acceptable when insufficient
    candidates are available.

## 7. Classification

### Purpose

The classifier answers one primary question:

> Given this research profile, is this paper worth inspecting for this
> research topic?

### Input

``` ts
type ClassificationInput = {
  researchProfile: {
    question: string;
    description: string;
    interests: string[];
    nonInterests: string[];
  };
  paper: {
    title: string;
    abstract: string;
  };
};
```

Papers without an abstract must not be sent through the normal classifier
path. Retain them and display a missing-abstract status separately from
relevance labels.

### Output

``` ts
type ClassificationResult = {
  relevance: "relevant" | "maybe" | "irrelevant";
  confidence: number;
};
```

`confidence` should be normalized to the range `0.0–1.0`.

Validate labels and finite confidence values before persistence. Confidence
is a classifier score, not a calibrated probability that its answer is
correct. Keep pending, failed, missing-abstract, and outdated states
distinct from the three relevance labels.

### Label semantics

**Relevant**\
The paper substantially addresses the research question or one or more
central interests.

**Maybe**\
The paper is meaningfully adjacent and may contain useful concepts,
methods, or related work, but its connection is not clearly central.

**Irrelevant**\
The paper does not materially contribute to the research topic or
primarily concerns explicitly excluded areas.

The classifier should remain a bounded classification component.
Generating explanations or summaries is outside MVP scope.

## 8. Local Inference Service

### Architecture

Development machine:

-   MacBook M2 Pro, 8 GB RAM
-   Runs web application, local SQLite database, and development tooling

Inference machine:

-   Windows PC
-   NVIDIA RTX 5070, 12 GB VRAM
-   32 GB system RAM
-   Runs local model inference

Architecture:

``` text
Mac / Next.js + SQLite
      |
      | HTTP
      v
PC / simple-jev HTTP service (FastAPI)
      |
      v
simple-jev
      |
      v
Open-source model
```

### Inference stack

-   Python
-   FastAPI
-   simple-jev initially; another local classifier is acceptable if it
    satisfies the application classification contract
-   Hugging Face model
-   Initial target model size: approximately 1B--4B parameters

The exact model is an implementation/configuration choice and may be
changed during evaluation without changing the product contract.

### Connection and API contract

The user has set up simple-jev on the Windows PC. Its HTTP health endpoint
has reported ready with model `Qwen/Qwen3.5-0.8B`; full classification
integration still requires verification. Application development must not
depend on the PC remaining available. Configure the connection in the
Git-ignored `.env` with `JEV_BASE_URL` and the served model identifier with
`JEV_MODEL`; provide placeholder connection details in `.env.example`.
Changing the PC address must not require application code changes.

`ClassificationInput` and `ClassificationResult` are the application's
stable internal contract. A small server-side HTTP adapter translates
that contract to the actual simple-jev API:

``` text
POST /v1/classifier
GET /health
```

Send the research profile and paper as shared `state`, the configured
`model`, and one `choice` question with `relevant`, `maybe`, and
`irrelevant` criteria using the label semantics in Section 7. Map the
answer's `choice` and `confidence` back to `ClassificationResult`.
Keep criterion order stable. A separate custom `/classify` service is
not required. Verify compatibility with the user's installed simple-jev
version when the PC is connected.

The web application must treat the classifier as an external service and
must not contain model-specific inference logic. Requests originate from
the Next.js server.

When verifying integration without the PC, use an explicitly selected test service returning
predictable responses to verify integration and recovery. Clearly mark
test results, keep them separate from real results, and exclude them from
model evaluation. Never silently substitute test results during an outage.

### Relationship to Jev

Simple-jev follows a similar structured-decision interface using open
models. It scores allowed answer tokens and constructs a structured
response, rather than asking a model to generate a JSON answer. It does
not reproduce TypeSafe Jev's architecture or training, or establish
equivalent accuracy, calibration, or speed. This experiment evaluates the
selected local model through simple-jev on Paper Radar's task.

References: [simple-jev project and self-hosting documentation](https://github.com/featherless-ai/simple-jev)
and [API reference](https://github.com/featherless-ai/simple-jev/blob/main/hf-server/API_REFERENCE.md).

## 9. Web Application

### Technology

-   Next.js
-   TypeScript
-   Local SQLite database on the Mac; replaces Supabase Postgres
-   No authentication for MVP
-   Local development/deployment for MVP

### Local storage

The Next.js server owns database access. Initialize and evolve the
database through migrations. Topics, candidates, classifications, and
saves must survive application and inference-service restarts. The PC
is used only for inference and does not store application data.

Keep the database file outside version control and provide a documented,
verified backup/restore procedure. Supabase accounts, hosted database
services, and database synchronization are not required for MVP.

### Main screens

#### Research Topics Dashboard

Displays all research topics.

Each topic should show at minimum:

-   topic name
-   number of papers scanned
-   relevant count
-   maybe count
-   saved count

Actions:

-   create topic
-   open topic
-   edit topic
-   delete topic

#### Create/Edit Research Topic

Inputs:

-   name
-   research question
-   description
-   interests
-   non-interests

#### Research Topic Results

Displays discovered papers associated with the topic.

Must support filtering by:

-   Relevant
-   Maybe
-   Irrelevant
-   Saved

Default ordering should prioritize:

1.  Relevant
2.  Maybe
3.  Irrelevant

Within a relevance class, higher classifier confidence should appear
first.

#### Paper Card

Display at minimum:

-   title
-   authors
-   publication year
-   abstract preview
-   relevance label
-   confidence
-   saved state
-   link to original paper

Actions:

-   save/unsave
-   open external paper
-   optionally expand abstract

A dedicated paper-detail page is optional for MVP if the card/expanded
view provides the required information.

## 10. Data Model

The conceptual entities are:

### ResearchTopic

Stores the user's research profile.

### Paper

Stores normalized paper metadata from the configured source.

A paper should exist once globally in the database when identified by
the same source paper ID. OpenAlex and Semantic Scholar IDs differ, so
switching sources can store the same paper twice.

### TopicPaper

Associates a retrieved Paper with a ResearchTopic before classification.
The pair `researchTopicId + paperId` is unique. Retain discovery time and
enough processing state to identify pending work, missing abstracts, and
failed attempts. A classifier outage must not lose this association.

### Classification

Associates a Paper with a ResearchTopic.

Contains at minimum:

``` ts
{
  researchTopicId: string;
  paperId: string;
  relevance: "relevant" | "maybe" | "irrelevant";
  confidence: number;
  classifiedAt: Date;
  profileRevision: number;
}
```

The combination of `researchTopicId + paperId` should be unique.

The stored revision identifies the profile used for the result, including
when the topic is edited during an in-flight request. Record the model,
classifier configuration/version, and measured request latency alongside
results or their evaluation run so comparisons remain interpretable.

### SavedPaper

Associates a saved paper with a research topic.

Contains at minimum:

``` ts
{
  researchTopicId: string;
  paperId: string;
  savedAt: Date;
}
```

## 11. Evaluation

The MVP includes a small manual evaluation of the classifier.

### Dataset

Manually label approximately **50 candidate papers** using the same
three classes:

-   Relevant
-   Maybe
-   Irrelevant

These human labels serve as ground truth for the initial experiment.
Hide model predictions during manual labeling. Preserve the profile
snapshot, model identity, classifier settings, predictions, human labels,
and timings used for an evaluation so later edits or reclassification do
not silently alter its report. Test-service results are excluded.

### Metrics

Measure:

-   accuracy
-   precision
-   recall
-   F1
-   average classification latency

Per-class metrics should be retained where practical.

Particular attention should be paid to **false negatives**: papers
manually judged Relevant that the classifier labels Irrelevant.

### Personal trust threshold

Reject the evaluated classifier as insufficiently trustworthy when
**30% or more of human-labeled Relevant papers are predicted Irrelevant**:

``` text
severe miss rate = count(human Relevant AND predicted Irrelevant)
                  / count(human Relevant)
```

Report Relevant-to-Maybe errors separately; they still affect standard
Relevant recall and F1. Show counts and denominators alongside percentages.
If there are no human-labeled Relevant papers, this rate is undefined,
not zero. A small number of Relevant examples limits conclusions; a rate
below 30% is not by itself proof of reliability. Report missing or failed
predictions separately and do not declare a completed evaluation while
selected evaluation papers still lack valid predictions.

The application can meet its functional acceptance criteria even if the
chosen model fails this usefulness threshold. Record the outcome honestly.

### Evaluation objective

The experiment should help answer:

> Can a small locally hosted model reliably filter academic search
> results according to a detailed research profile?

The goal is not to prove that the selected model is universally
effective.

## 12. Error Handling

The application should handle at minimum:

-   paper source (OpenAlex or Semantic Scholar) API failure
-   paper source rate limiting
-   local classifier unavailable
-   classifier timeout/failure
-   invalid classifier response or unsupported input length
-   missing paper abstracts
-   duplicate search results
-   empty search results

Failures should not silently discard previously retrieved or classified
data.

A classifier outage should not make existing research topics/results
inaccessible.

Retry unfinished work without repeating successful classifications unless
the user explicitly requests reclassification. Persist successful work
incrementally and preserve previous results if replacement attempts fail.

## 13. MVP Acceptance Criteria

The MVP is complete when all of the following are true:

-   A research topic can be created, edited, viewed, and deleted.
-   A topic supports question, description, interests, and
    non-interests.
-   Search queries are derived without a generative LLM.
-   Candidate papers are retrieved from OpenAlex or Semantic Scholar.
-   Duplicate candidates are removed.
-   Papers with abstracts can be sent to the PC-hosted classifier.
-   The classifier returns Relevant, Maybe, or Irrelevant plus
    confidence.
-   Classifications are persisted per research topic.
-   Results can be browsed and filtered by relevance.
-   Papers can be saved and unsaved.
-   Original paper links are accessible.
-   Existing results remain usable when the inference PC is offline.
-   Approximately 50 papers can be manually labeled and compared against
    classifier output.
-   Basic accuracy, precision, recall, F1, and latency can be
    calculated.
-   The application runs locally without authentication.
-   All application data is stored in local SQLite and survives restarts;
    backup and restore are documented and verified.
-   Candidates and topic associations persist before classification.
-   Classification integration can be verified with clearly marked test
    results before the PC is ready; real inference is required for final
    acceptance and evaluation.
-   The PC connection is configurable, and simple-jev's real API is
    verified when the user's URL becomes available.
-   Relevant profile edits visibly mark results outdated; reclassification
    is explicit and failed replacement attempts preserve old results.
-   Evaluation reports the personal 30% severe-miss rejection threshold.

## 14. Implementation Principles

1.  **Keep retrieval and classification separate.** The paper source
    retrieves candidates; the local model judges relevance.
2.  **Keep the classifier replaceable.** The web application depends on
    the API contract, not simple-jev or a specific model.
3.  **Persist useful work.** Retrieved papers and classifications should
    survive application/model restarts.
4.  **Do not introduce an LLM where deterministic logic is sufficient.**
5.  **Prefer a working experiment over feature breadth.**
6.  **Do not implement non-goals unless required to satisfy an MVP
    acceptance criterion.**

## 15. Future Work

Potential post-MVP additions include:

-   automatic periodic scanning for newly published papers
-   cloud deployment
-   remote inference hosting
-   alternative classifiers/models
-   classifier comparison dashboard
-   LLM baseline comparison
-   paper summaries
-   PDF/full-text ingestion
-   citation graph exploration
-   research-topic recommendations
-   semantic/embedding retrieval
-   notifications for newly discovered relevant papers
-   multi-user accounts
-   paper notes and reading status

These are explicitly outside the MVP.

## 16. Key Technical Question

Paper Radar is both a usable research tool and an experiment.

The central technical question is:

> **Can a small, locally hosted classifier act as an effective
> relevance-filtering layer between broad academic retrieval and a
> researcher's reading queue?**

All MVP implementation decisions should support answering that question
without unnecessarily expanding the system.

## 17. Implementation and Personal Verification Gates

There is no hard weekend deadline. Deliver one verifiable part at a time.
Each part includes a runnable demonstration, exact verification steps,
expected results, and appropriate automated checks. Stop after each part
until the user personally verifies it and approves proceeding.

| Part | Deliverable | Personal verification |
| --- | --- | --- |
| 1. Local topics and storage | Next.js, SQLite migrations, topic create/edit/delete, backup/restore instructions | Create two topics, restart, verify all fields persist, edit and delete, and verify a backup can be restored. |
| 2. Query preview | Deterministic queries visible before discovery | Identical profiles produce identical queries; meaningful input changes produce understandable changes. |
| 3. Real discovery | OpenAlex or Semantic Scholar retrieval, deduplication, persisted candidates and topic associations | Open original links, repeat discovery without duplicates, restart without losing candidates, and inspect missing-abstract handling. |
| 4. Classification plumbing | HTTP adapter and clearly marked test service | Persist results, skip completed papers on repeat runs, interrupt processing, and retry unfinished work without losing progress. |
| 5. Browsing and saving | Filters, ordering, paper cards, topic counts, save/unsave | Check known results and counts, verify saves remain independent across topics, and browse while inference is offline. |
| 6. Edits and recovery | Outdated labels, explicit reclassification, complete failure handling | Edit classification inputs, observe outdated results, verify a rename does not invalidate them, and reproduce rate limits, empty results, timeouts, and invalid responses without losing work. |
| 7. Connect the PC | Configure the user's URL and model; verify real simple-jev integration | Classify real papers from the Mac, inspect valid outputs and latency, and confirm outage recovery without test-service fallback. |
| 8. Evaluate usefulness | Blind manual labeling and evaluation report | Label approximately 50 papers, inspect disagreements and known-example metric calculations, and assess the 30% severe-miss threshold. |

Parts 1–6 do not require the PC to be ready. Part 7 may move earlier once
the PC and classification integration are available, with the same user
verification gate. Error handling is implemented with each relevant part;
Part 6 verifies the complete workflow.
