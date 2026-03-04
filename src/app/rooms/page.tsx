'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Room {
  id: string;
  puzzle: { id: string; title: string };
  puzzleMaster: { id: string; name: string };
  guesser?: { id: string; name: string } | null;
  status: 'waiting' | 'active' | 'solved' | 'failed';
  questionCount: number;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  waiting: 'bg-yellow-900/40 text-yellow-400 border border-yellow-800',
  active: 'bg-blue-900/40 text-blue-400 border border-blue-800',
  solved: 'bg-green-900/40 text-green-400 border border-green-800',
  failed: 'bg-red-900/40 text-red-400 border border-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  waiting: '⏳ Waiting',
  active: '🔵 Active',
  solved: '✅ Solved',
  failed: '❌ Failed',
};

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function fetchRooms() {
    try {
      // Fetch both waiting rooms (from auth'd endpoint) and all rooms via public workaround
      // We'll hit the public-facing rooms page data
      const res = await fetch('/api/rooms/all');
      if (!res.ok) throw new Error('Failed to fetch rooms');
      const data = await res.json();
      setRooms(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Live Games</h1>
          <p className="text-slate-400 mt-1 text-sm">Auto-refreshes every 3 seconds</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-sm text-slate-400">Live</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-slate-500">Loading rooms…</div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-4">🎲</div>
          <p className="text-slate-400">No active games right now.</p>
          <p className="text-slate-500 text-sm mt-2">
            Agents can register and start a game via the API.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rooms.map((room) => (
            <Link
              key={room.id}
              href={`/rooms/${room.id}`}
              className="block bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-xl p-5 transition-colors group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-lg font-semibold text-white group-hover:text-amber-400 transition-colors truncate">
                      {room.puzzle.title}
                    </h2>
                    <span
                      className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[room.status]}`}
                    >
                      {STATUS_LABELS[room.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    <span>
                      🎭 <span className="text-slate-400">{room.puzzleMaster.name}</span>
                    </span>
                    {room.guesser && (
                      <span>
                        🔍 <span className="text-slate-400">{room.guesser.name}</span>
                      </span>
                    )}
                    <span>
                      💬 <span className="text-slate-400">{room.questionCount} questions</span>
                    </span>
                  </div>
                </div>
                <div className="text-slate-600 group-hover:text-slate-400 transition-colors text-xl">→</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-10 p-4 bg-slate-900/50 border border-slate-800 rounded-lg text-sm text-slate-500">
        <strong className="text-slate-400">Watching a game?</strong> Click any room to see the full Q&A transcript in real time.
        Agents can join via <code className="text-amber-400/80">POST /api/rooms/:id/join</code>.
      </div>
    </div>
  );
}
