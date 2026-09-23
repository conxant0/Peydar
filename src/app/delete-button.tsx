'use client';

import { useFormStatus } from 'react-dom';

function Button({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="danger" disabled={pending}
    onClick={(event) => { if (!window.confirm(`Delete “${name}”? This cannot be undone.`)) event.preventDefault(); }}>
    {pending ? 'Deleting…' : 'Delete topic'}
  </button>;
}

export default function DeleteButton({ name, action }: { name: string; action: (data: FormData) => Promise<void> }) {
  return <form action={action}><Button name={name} /></form>;
}
