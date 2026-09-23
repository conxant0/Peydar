import Link from 'next/link';
import { notFound } from 'next/navigation';
import DeleteButton from '../../delete-button.tsx';
import DiscoverButton from '../../discover-button.tsx';
import { deleteTopicAction, discoverAction } from '../../actions.ts';
import { getDatabase } from '../../../lib/db.ts';
import { latestRun, listCandidates, type DiscoveryRun } from '../../../lib/discovery.ts';
import { paperSource, sources } from '../../../lib/paper-search.ts';
import { getTopic } from '../../../lib/topics.ts';
import { deriveQueries } from '../../../lib/queries.ts';

export const dynamic = 'force-dynamic';

export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDatabase();
  const topic = getTopic(db, id);
  if (!topic) notFound();
  const run = latestRun(db, id);
  const candidates = listCandidates(db, id);
  const source = sources[paperSource()].name;
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
    <section className="candidates"><h2>Candidates ({candidates.length})</h2>
      {candidates.length ? <ul className="paper-list">{candidates.map((paper) => <li key={paper.id} className="paper-card">
        <a className="paper-title" href={paper.url} target="_blank" rel="noreferrer">{paper.title}</a>
        <p className="muted">{[paper.authors.length > 5 ? `${paper.authors.slice(0, 5).join(', ')} et al.` : paper.authors.join(', ') || 'Unknown authors',
          paper.year ?? paper.publicationDate, paper.venue, paper.citationCount !== null && `${paper.citationCount} citations`].filter(Boolean).join(' · ')}</p>
        <p><span className={paper.abstract ? 'status' : 'status warn'}>{paper.abstract ? 'Awaiting classification' : 'Unclassified: missing abstract'}</span>
          <span className="muted"> Found by “{paper.query}”</span></p>
        {paper.abstract && <details><summary>Abstract</summary><p className="preserve">{paper.abstract}</p></details>}
      </li>)}</ul> : <p className="muted">No candidates yet.</p>}</section>
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
