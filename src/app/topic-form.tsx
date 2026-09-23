'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { FormState } from './actions.ts';
import type { TopicInput } from '../lib/topics.ts';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? 'Saving…' : label}</button>;
}

function PhraseFields({ name, title, initial = '', error }: {
  name: 'interests' | 'nonInterests';
  title: string;
  initial?: string;
  error?: string;
}) {
  const [items, setItems] = useState(() => initial ? initial.split('\n') : ['']);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const focusIndex = useRef<number | null>(null);
  useEffect(() => {
    if (focusIndex.current !== null) inputs.current[focusIndex.current]?.focus();
    focusIndex.current = null;
  }, [items.length]);
  const singular = name === 'interests' ? 'Interest' : 'Non-interest';
  return <fieldset className="phrase-fields">
    <legend>{title}</legend>
    <p className="hint">One phrase per box. Use Add {singular.toLowerCase()} for another.</p>
    {items.map((item, index) => <div className="phrase-row" key={index}>
      <input name={name} type="text" value={item} ref={(element) => { inputs.current[index] = element; }}
        aria-label={`${singular} ${index + 1}`}
        aria-invalid={!!error} aria-describedby={error ? `${name}-error` : undefined}
        onChange={(event) => {
          const next = event.target.value;
          setItems((current) => current.map((value, position) => position === index ? next : value));
        }} />
      {items.length > 1 && <button type="button" className="secondary" onClick={() => {
        focusIndex.current = Math.min(index, items.length - 2);
        setItems((current) => current.filter((_, position) => position !== index));
      }}
        aria-label={`Remove ${singular.toLowerCase()} ${index + 1}`}>Remove</button>}
    </div>)}
    <button type="button" className="secondary" onClick={() => {
      focusIndex.current = items.length;
      setItems((current) => [...current, '']);
    }}>Add {singular.toLowerCase()}</button>
    {error && <p className="error" id={`${name}-error`}>{error}</p>}
  </fieldset>;
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
    <PhraseFields name="interests" title="Interests" initial={values?.interests} error={state.errors?.interests} />
    <PhraseFields name="nonInterests" title="Non-interests (optional)" initial={values?.nonInterests} error={state.errors?.nonInterests} />
    <SubmitButton label={label} />
  </form>;
}
