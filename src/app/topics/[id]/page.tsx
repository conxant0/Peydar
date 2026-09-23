import Link from 'next/link';
import { notFound } from 'next/navigation';
import DeleteButton from '../../delete-button.tsx';
import { deleteTopicAction } from '../../actions.ts';
import { getDatabase } from '../../../lib/db.ts';
import { getTopic } from '../../../lib/topics.ts';
import { deriveQueries } from '../../../lib/queries.ts';

export const dynamic = 'force-dynamic';

export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const topic = getTopic(getDatabase(), id);
  if (!topic) notFound();
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
  </div>;
}
