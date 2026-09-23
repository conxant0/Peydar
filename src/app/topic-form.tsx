'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { FormState } from './actions.ts';
import type { TopicInput } from '../lib/topics.ts';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? 'Saving…' : label}</button>;
}

export default function TopicForm({
  action, initial, label,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  initial?: TopicInput;
  label: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const values = state.values ?? initial;
  const field = (name: keyof TopicInput, title: string, multiline = false, required = false) => (
    <div className="field">
      <label htmlFor={name}>{title}</label>
      {multiline ?
        <textarea id={name} name={name} rows={name === 'description' ? 5 : 4}
          key={`${name}:${values?.[name] ?? ''}`} defaultValue={values?.[name] ?? ''}
          aria-invalid={!!state.errors?.[name]} aria-describedby={state.errors?.[name] ? `${name}-error` : undefined} /> :
        <input id={name} name={name} type="text" required={required}
          key={`${name}:${values?.[name] ?? ''}`} defaultValue={values?.[name] ?? ''}
          aria-invalid={!!state.errors?.[name]} aria-describedby={state.errors?.[name] ? `${name}-error` : undefined} />}
      {state.errors?.[name] && <p className="error" id={`${name}-error`}>{state.errors[name]}</p>}
    </div>
  );
  return <form action={formAction} className="topic-form">
    {state.message && <p className="error" role="alert">{state.message}</p>}
    {field('name', 'Topic name', false, true)}
    {field('question', 'Research question', false, true)}
    {field('description', 'Description', true)}
    {field('interests', 'Interests', true)}
    {field('nonInterests', 'Non-interests', true)}
    <p className="hint">Put one interest or non-interest on each line. Non-interests can be blank.</p>
    <SubmitButton label={label} />
  </form>;
}
