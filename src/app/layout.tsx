import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = { title: 'Paper Radar', description: 'Your local research topics' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>
    <header className="site-header"><div className="container header-inner">
      <Link href="/" className="brand">Paper Radar</Link>
      <span className="header-note">Local research workspace</span>
    </div></header>
    <main className="container">{children}</main>
  </body></html>;
}
