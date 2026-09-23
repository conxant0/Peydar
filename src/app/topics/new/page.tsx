import Link from 'next/link';
import TopicForm from '../../topic-form.tsx';
import { createTopicAction } from '../../actions.ts';

export default function NewTopic() {
  return <div className="narrow"><Link className="back" href="/">← All topics</Link>
    <p className="eyebrow">Research profile</p><h1>Create a topic</h1>
    <p className="muted">Describe the work you want Paper Radar to find.</p>
    <TopicForm action={createTopicAction} label="Create topic" />
  </div>;
}
