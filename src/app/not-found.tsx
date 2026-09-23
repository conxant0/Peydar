import Link from 'next/link';

export default function NotFound() {
  return <div className="narrow"><h1>Topic not found</h1><p className="muted">It may have been deleted.</p>
    <Link href="/">Back to all topics</Link></div>;
}
