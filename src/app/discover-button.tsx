'use client';

import { useFormStatus } from 'react-dom';

function Button({ again, source }: { again: boolean; source: string }) {
  const { pending } = useFormStatus();
  return <>
    <button type="submit" disabled={pending}>{pending ? `Searching ${source}…` : again ? 'Discover again' : 'Discover papers'}</button>
    <span className="muted" role="status">{pending ? 'Each query is saved as it completes. This can take a minute.' : ''}</span>
  </>;
}

export default function DiscoverButton({ again, source, action }: { again: boolean; source: string; action: (data: FormData) => Promise<void> }) {
  return <form action={action} className="actions"><Button again={again} source={source} /></form>;
}
