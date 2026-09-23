import Link from 'next/link';
import { countCandidates } from '../lib/browsing.ts';
import { getDatabase } from '../lib/db.ts';
import { listCandidates } from '../lib/discovery.ts';
import { listTopics } from '../lib/topics.ts';

export const dynamic = 'force-dynamic';

export default function Home() {
  const db = getDatabase();
  const topics = listTopics(db);
  return <>
    <div className="page-heading"><div><p className="eyebrow">Research topics</p><h1>Your topics</h1>
      <p className="muted">Define what you want to discover. Your topics stay on this Mac.</p></div>
      <Link className="button" href="/topics/new">Create topic</Link>
    </div>
    {topics.length ? <ul className="topic-list">{topics.map((topic) => <li key={topic.id}>
      <Link href={`/topics/${topic.id}`} className="topic-card"><span className="topic-title">{topic.name}</span>
        <span className="muted">{topic.question}</span>
        <TopicCounts counts={countCandidates(listCandidates(db, topic.id))} /><span className="topic-arrow" aria-hidden="true">→</span></Link>
    </li>)}</ul> : <div className="empty"><h2>No topics yet</h2>
      <p>Create a topic to save your research question, interests, and exclusions.</p></div>}
  </>;
}

function TopicCounts({ counts }: { counts: ReturnType<typeof countCandidates> }) {
  return <span className="topic-counts">{counts.retrieved} retrieved · {counts.scanned} scanned · {counts.relevant} Relevant · {counts.maybe} Maybe · {counts.saved} saved
    {counts.outdated > 0 && ` · ${counts.outdated} outdated`}</span>;
}
