import Link from 'next/link';
import { notFound } from 'next/navigation';
import DeleteButton from '../../delete-button.tsx';
import ClassifyButton from '../../classify-button.tsx';
import DiscoverButton from '../../discover-button.tsx';
import { classifyNextAction, deleteTopicAction, discoverAction, saveAction } from '../../actions.ts';
import { countCandidates, filterCandidates, parseFilter, type Filter } from '../../../lib/browsing.ts';
import { classificationProgress } from '../../../lib/classification.ts';
import { testMode } from '../../../lib/classifier.ts';
import { getDatabase } from '../../../lib/db.ts';
import { latestRun, listCandidates, type Candidate, type DiscoveryRun } from '../../../lib/discovery.ts';
import { paperSource, sources } from '../../../lib/paper-search.ts';
import { getTopic } from '../../../lib/topics.ts';
import { deriveQueries } from '../../../lib/queries.ts';

export const dynamic = 'force-dynamic';

const labels = { relevant: 'Relevant', maybe: 'Maybe', irrelevant: 'Irrelevant' } as const;

export default async function TopicPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const filter = parseFilter((await searchParams).filter);
  const db = getDatabase();
  const topic = getTopic(db, id);
  if (!topic) notFound();
  const run = latestRun(db, id);
  const candidates = listCandidates(db, id);
  const source = sources[paperSource()].name;
  const progress = classificationProgress(db, id);
  const counts = countCandidates(candidates);
  const shown = filterCandidates(candidates, filter);
  const classified = shown.filter((paper) => paper.classification);
  const unclassified = shown.filter((paper) => !paper.classification);
  const filterLink = (value: Filter | null, label: string, count: number) =>
    <Link key={label} href={value ? `/topics/${id}?filter=${value}` : `/topics/${id}`} scroll={false} className="filter" aria-current={filter === value ? 'page' : undefined}>
      {label} ({count})</Link>;
  const list = (papers: Candidate[]) => <ul className="paper-list">{papers.map((paper) =>
    <PaperCard key={paper.id} paper={paper} save={saveAction.bind(null, id, paper.id, !paper.savedAt)} />)}</ul>;
  return <div className="narrow"><Link className="back" href="/">← All topics</Link>
    <p className="eyebrow">Research profile</p><h1>{topic.name}</h1>
    <section className="detail"><h2>Research question</h2><p>{topic.question}</p></section>
    <section className="detail"><h2>Description</h2><p className="preserve">{topic.description}</p></section>
    <section className="detail"><h2>Interests</h2><ul>{topic.interests.map((item, index) => <li key={index}>{item}</li>)}</ul></section>
    <section className="detail"><h2>Non-interests</h2>{topic.nonInterests.length ?
      <ul>{topic.nonInterests.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="muted">None</p>}</section>
    <section className="detail"><h2>Query preview</h2><p className="muted">These searches are derived from your interests, question, and description.</p>
      <ol>{deriveQueries(topic).map((query) => <li key={query}>{query}</li>)}</ol></section>
    <div className="actions"><Link className="button" href={`/topics/${id}/edit`}>Edit topic</Link>
      <DeleteButton name={topic.name} action={deleteTopicAction.bind(null, id)} /></div>
    <section className="detail"><h2>Discovery</h2>
      <p className="muted">Searches {source} with the queries above and keeps up to 50 new papers per run.</p>
      <DiscoverButton again={!!run} source={source} action={discoverAction.bind(null, id)} />
      {run && <RunSummary run={run} total={candidates.length} />}</section>
    <section className="detail"><h2>Classification</h2>
      <p className="muted">Sends each paper with an abstract to {testMode() ? 'the local test service' : 'the classifier'} one at a time. Each result is saved as it arrives; classified papers are not sent again.</p>
      <p>{progress.classified} of {progress.total - progress.missingAbstract} classified · {progress.pending} pending · {progress.failed} failed · {progress.missingAbstract} missing abstract</p>
      <ClassifyButton unfinished={progress.pending + progress.failed} action={classifyNextAction.bind(null, id)} /></section>
    <section className="candidates"><h2>Papers</h2>
      <p>{counts.retrieved} retrieved · {counts.scanned} scanned · {counts.relevant} Relevant · {counts.maybe} Maybe · {counts.irrelevant} Irrelevant · {counts.saved} saved</p>
      {counts.outdated > 0 && <p className="notice">{counts.outdated} {counts.outdated === 1 ? 'label was' : 'labels were'} produced for an earlier version of this profile and {counts.outdated === 1 ? 'is' : 'are'} marked outdated.</p>}
      <nav className="filters" aria-label="Filter papers">{filterLink(null, 'All', counts.retrieved)}
        {(['relevant', 'maybe', 'irrelevant'] as const).map((value) => filterLink(value, labels[value], counts[value]))}
        {filterLink('saved', 'Saved', counts.saved)}</nav>
      {!candidates.length ? <p className="muted">No candidates yet.</p> : !shown.length ? <p className="muted">No papers match this filter.</p> : <>
        {classified.length > 0 && <><h3>Classified ({classified.length})</h3>{list(classified)}</>}
        {unclassified.length > 0 && <><h3>Unclassified ({unclassified.length})</h3>
          <p className="muted">Pending, failed, or missing an abstract. These have no relevance label.</p>{list(unclassified)}</>}
      </>}</section>
  </div>;
}

function RunSummary({ run, total }: { run: DiscoveryRun; total: number }) {
  const returned = run.queries.reduce((sum, query) => sum + (query.returned ?? 0), 0);
  const problems = run.queries.filter((query) => query.status === 'failed' || query.status === 'skipped').length;
  return <div className="run">
    <p><strong>{run.finishedAt ? 'Last run finished' : 'Last run did not finish (interrupted or still running)'}</strong> ·
      {' '}{new Date(run.finishedAt ?? run.startedAt).toLocaleString()} · added {run.newPapers} new {run.newPapers === 1 ? 'paper' : 'papers'}</p>
    {total < 20 && <p className="notice">
      {`Fewer than 20 candidates. The search returned ${returned} results in the last run`}
      {problems ? `, and ${problems} ${problems === 1 ? 'query' : 'queries'} failed or were skipped (see below).` : '.'}
      {run.finishedAt && !problems && ' These queries do not match more papers; editing the profile changes the queries.'}</p>}
    <table><thead><tr><th scope="col">Query</th><th scope="col">Status</th><th scope="col">Returned</th><th scope="col">New</th></tr></thead>
      <tbody>{run.queries.map((query) => <tr key={query.query}>
        <td>{query.query}{query.error && <span className="error">{query.error}</span>}</td>
        <td>{{ pending: 'Not run', done: 'Done', failed: 'Failed', skipped: 'Skipped' }[query.status]}</td>
        <td>{query.returned ?? '—'}</td><td>{query.added ?? '—'}</td></tr>)}</tbody></table>
  </div>;
}

function PaperCard({ paper, save }: { paper: Candidate; save: (data: FormData) => Promise<void> }) {
  return <li className="paper-card">
    <a className="paper-title" href={paper.url} target="_blank" rel="noreferrer">{paper.title}</a>
    <p className="muted">{[paper.authors.length > 5 ? `${paper.authors.slice(0, 5).join(', ')} et al.` : paper.authors.join(', ') || 'Unknown authors',
      paper.year ?? paper.publicationDate ?? 'Year unknown', paper.venue, paper.citationCount !== null && `${paper.citationCount} citations`].filter(Boolean).join(' · ')}</p>
    <p><PaperStatus paper={paper} />{paper.savedAt && <span className="status saved">Saved</span>}<span className="muted"> Found by “{paper.query}”</span></p>
    {!paper.classification && paper.lastError && <p className="error">Last attempt failed: {paper.lastError}</p>}
    {paper.abstract ? <>
      <p className="abstract-preview">{paper.abstract}</p>
      <details><summary>Full abstract</summary><p className="preserve">{paper.abstract}</p></details>
    </> : <p className="muted">No abstract available.</p>}
    <form action={save} className="card-actions">
      <button type="submit" className="secondary">{paper.savedAt ? 'Unsave' : 'Save'}<span className="visually-hidden"> “{paper.title}”</span></button>
      <a href={paper.url} target="_blank" rel="noreferrer">Open paper<span className="visually-hidden"> “{paper.title}” (opens in a new tab)</span></a>
    </form>
  </li>;
}

function PaperStatus({ paper }: { paper: Candidate }) {
  const result = paper.classification;
  if (result) {
    return <span className={`status ${result.relevance}`} title={`${result.model}, ${result.latencyMs} ms`}>
      {labels[result.relevance]} · {result.confidence.toFixed(2)}
      {result.outdated && ' · outdated'}{result.testService && ' · test result'}</span>;
  }
  if (!paper.abstract) return <span className="status warn">Unclassified: missing abstract</span>;
  if (paper.claimed) return <span className="status">Classifying…</span>;
  return <span className="status warn">{paper.lastError ? 'Unclassified: failed' : 'Unclassified: pending'}</span>;
}
