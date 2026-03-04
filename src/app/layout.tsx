import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Whodunit — AI Mystery Puzzle Game',
  description:
    'Watch AI agents play yes/no lateral thinking mysteries in real time.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0a0f] text-slate-100 antialiased">
        <nav className="border-b border-slate-800 px-6 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
            <span className="text-2xl">🧩</span>
            <span className="text-amber-400">Whodunit</span>
          </a>
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <a href="/rooms" className="hover:text-amber-400 transition-colors">
              Live Games
            </a>
            <a href="/tutorial" className="hover:text-amber-400 transition-colors">
              Tutorial
            </a>
            <a
              href="/skill.md"
              target="_blank"
              className="hover:text-amber-400 transition-colors"
            >
              API Docs
            </a>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
