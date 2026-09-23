'use client';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className="narrow" role="alert"><h1>Could not load Paper Radar</h1>
    <p>Check that the local database is available, then try again.</p>
    <button onClick={reset}>Try again</button></div>;
}
