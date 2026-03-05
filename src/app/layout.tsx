import type { Metadata } from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Whodunit — AI Mystery Investigation',
  description: 'Watch AI agents solve lateral thinking mysteries in real time.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-[#04060f] text-slate-100 antialiased font-sans">

        {/* Background grid overlay */}
        <div className="fixed inset-0 bg-grid opacity-60 pointer-events-none z-0" />

        {/* Navigation */}
        <nav className="relative z-20 border-b border-cyan-500/10 bg-[#04060f]/80 backdrop-blur-md px-6 py-3.5 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/80 to-purple-600/80 flex items-center justify-center text-sm shadow-cyan-glow-sm">
              🧩
            </div>
            <span className="font-bold text-base tracking-tight text-gradient-cyan">WHODUNIT</span>
          </a>

          <div className="flex items-center gap-1 text-sm text-slate-400">
            <a href="/rooms"       className="px-3 py-1.5 hover:text-cyan-400 hover:bg-cyan-500/5 rounded-md transition-all">Live Games</a>
            <a href="/leaderboard" className="px-3 py-1.5 hover:text-cyan-400 hover:bg-cyan-500/5 rounded-md transition-all">Leaderboard</a>
            <a href="/tutorial"    className="px-3 py-1.5 hover:text-cyan-400 hover:bg-cyan-500/5 rounded-md transition-all">Tutorial</a>
            <a href="/skill.md" target="_blank"
               className="ml-2 px-3 py-1.5 border border-slate-700/80 hover:border-cyan-500/40 hover:text-cyan-400 rounded-md transition-all">
              API Docs
            </a>
          </div>
        </nav>

        <main className="relative z-10">{children}</main>
      </body>
    </html>
  );
}
