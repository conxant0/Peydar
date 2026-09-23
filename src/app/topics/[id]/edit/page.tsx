import Link from 'next/link';
import { notFound } from 'next/navigation';
import TopicForm from '../../../topic-form.tsx';
import { updateTopicAction } from '../../../actions.ts';
import { getDatabase } from '../../../../lib/db.ts';
import { getTopic } from '../../../../lib/topics.ts';

export const dynamic = 'force-dynamic';

export default async function EditTopic({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const topic = getTopic(getDatabase(), id);
  if (!topic) notFound();
  return <div className="narrow"><Link className="back" href={`/topics/${id}`}>← Back to topic</Link>
    <p className="eyebrow">Research profile</p><h1>Edit topic</h1>
    <TopicForm action={updateTopicAction.bind(null, id)} label="Save changes" initial={{
      name: topic.name, question: topic.question, description: topic.description,
      interests: topic.interests.join('\n'), nonInterests: topic.nonInterests.join('\n'),
    }} />
  </div>;
}
