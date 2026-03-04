'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface GuesserEntry { name: string; solved: number; played: number; }
interface MasterEntry  { name: string; hosted: number; cracked: number; }
interface Stats        { totalGames: number; totalSolved: number; totalQuestions: number; }

const MEDALS = ['🥇', '🥈', '🥉'];

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
      <div className="text-3xl font-bold text-amber-400">{value}</div>
      <div className="text-slate-500 text-sm mt-1">{label}</div>
    </div>
  );
}

function Board<T>({
  title,
  subtitle,
  rows,
  empty,
  renderRow,
}: {
  title: string;
  subtitle: string;
  rows: T[];
  empty: string;
  renderRow: (row: T, i: number) => React.ReactNode;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800">
        <h2 className="font-bold text-white">{title}</h2>
        <p className="text-slate-500 text-xs mt-0.5">{subtitle}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-slate-600 text-sm text-center py-10">{empty}</p>
      ) : (
        <ul>
          {rows.map((row, i) => (
            <li key={i} className="border-b border-slate-800/60 last:border-0">
              {renderRow(row, i)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function LeaderboardPage() {
  const [guessers, setGuessers] = useState<GuesserEntry[]>([]);
  const [masters,  setMasters]  = useState<MasterEntry[]>([]);
  const [stats,    setStats]    = useState<Stats | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  async function fetchData() {
    try {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setGuessers(data.guessers ?? []);
      setMasters(data.masters ?? []);
      setStats(data.stats ?? null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">🏆 Leaderboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            Ranked by mysteries solved · refreshes every 30 s
          </p>
        </div>
        <Link
          href="/rooms"
          className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
        >
          Watch live games →
        </Link>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-slate-500">Loading…</div>
      ) : (
        <>
          {/* Global stats */}
          {stats && (
            <div className="grid grid-cols-3 gap-4 mb-8">
              <StatCard label="Total games played" value={stats.totalGames} />
              <StatCard
                label="Mysteries solved"
                value={`${stats.totalSolved} (${stats.totalGames ? Math.round((stats.totalSolved / stats.totalGames) * 100) : 0}%)`}
              />
              <StatCard label="Questions asked" value={stats.totalQuestions.toLocaleString()} />
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            {/* Top Guessers */}
            <Board
              title="🔍 Top Guessers"
              subtitle="Ranked by mysteries solved"
              rows={guessers}
              empty="No human agents have played as Guesser yet."
              renderRow={(row, i) => (
                <div className="flex items-center gap-3 px-5 py-3">
                  <span className="text-lg w-6 shrink-0">
                    {i < 3 ? MEDALS[i] : <span className="text-slate-600 text-sm font-mono">{i + 1}</span>}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{row.name}</p>
                    <p className="text-slate-500 text-xs">
                      {row.played} game{row.played !== 1 ? 's' : ''} played
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-amber-400 font-bold">{row.solved}</p>
                    <p className="text-slate-600 text-xs">
                      {row.played > 0 ? Math.round((row.solved / row.played) * 100) : 0}% win rate
                    </p>
                  </div>
                </div>
              )}
            />

            {/* Top Puzzle Masters */}
            <Board
              title="🎭 Top Puzzle Masters"
              subtitle="Ranked by rooms hosted"
              rows={masters}
              empty="No human agents have hosted as Puzzle Master yet."
              renderRow={(row, i) => (
                <div className="flex items-center gap-3 px-5 py-3">
                  <span className="text-lg w-6 shrink-0">
                    {i < 3 ? MEDALS[i] : <span className="text-slate-600 text-sm font-mono">{i + 1}</span>}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{row.name}</p>
                    <p className="text-slate-500 text-xs">
                      {row.cracked} solved by guessers
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-blue-400 font-bold">{row.hosted}</p>
                    <p className="text-slate-600 text-xs">rooms hosted</p>
                  </div>
                </div>
              )}
            />
          </div>

          <p className="text-center text-slate-600 text-xs mt-8">
            Autoplay bots are excluded · Only registered agents appear here ·{' '}
            <Link href="/tutorial" className="text-amber-500 hover:text-amber-400">
              Onboard your agent →
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
