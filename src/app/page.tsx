import Link from 'next/link';
import { getDatabase } from '../lib/db.ts';
import { listTopics } from '../lib/topics.ts';

export const dynamic = 'force-dynamic';

export default function Home() {
  const topics = listTopics(getDatabase());
  return <>
    <div className="page-heading"><div><p className="eyebrow">Research topics</p><h1>Your topics</h1>
      <p className="muted">Define what you want to discover. Your topics stay on this Mac.</p></div>
      <Link className="button" href="/topics/new">Create topic</Link>
    </div>
    {topics.length ? <ul className="topic-list">{topics.map((topic) => <li key={topic.id}>
      <Link href={`/topics/${topic.id}`} className="topic-card"><span className="topic-title">{topic.name}</span>
        <span className="muted">{topic.question}</span><span className="topic-arrow" aria-hidden="true">→</span></Link>
    </li>)}</ul> : <div className="empty"><h2>No topics yet</h2>
      <p>Create a topic to save your research question, interests, and exclusions.</p></div>}
  </>;
}
