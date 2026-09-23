import type { Metadata } from 'next';
import Link from 'next/link';
import { testMode } from '../lib/classifier.ts';
import './globals.css';

// Read the test-mode flag at request time so every page shows the banner.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Paper Radar', description: 'Your local research topics' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>
    <header className="site-header"><div className="container header-inner">
      <Link href="/" className="brand">Paper Radar</Link>
      <span className="header-note">Local research workspace</span>
    </div></header>
    {testMode() && <p className="test-banner" role="status">Test mode: classifications come from the local test service and are not real results.</p>}
    <main className="container">{children}</main>
  </body></html>;
}
