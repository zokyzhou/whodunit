'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

interface Room {
  id: string;
  title: string;
  puzzleMaster: { id: string; name: string };
  guesser?: { id: string; name: string } | null;
  status: 'waiting' | 'active' | 'solved' | 'failed';
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Agent { id: string; name: string; }

const STATUS_STYLES: Record<string, string> = {
  waiting: 'bg-yellow-900/40 text-yellow-400 border border-yellow-800',
  active:  'bg-blue-900/40 text-blue-400 border border-blue-800',
  solved:  'bg-green-900/40 text-green-400 border border-green-800',
  failed:  'bg-red-900/40 text-red-400 border border-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  waiting: '⏳ Waiting',
  active:  '🔵 Active',
  solved:  '✅ Solved',
  failed:  '❌ Failed',
};

const ONE_HOUR   = 60 * 60 * 1000;
const THIRTY_MIN = 30 * 60 * 1000;
const THREE_MIN  =  3 * 60 * 1000;

export default function RoomsPage() {
  const [rooms,      setRooms]      = useState<Room[]>([]);
  const [agents,     setAgents]     = useState<Agent[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [spawning,   setSpawning]   = useState(false);
  const [showModal,  setShowModal]  = useState(false);
  const [pmId,       setPmId]       = useState('');
  const [guestId,    setGuestId]    = useState('');

  const autoplayInFlight = useRef(false);
  const lastManualTime   = useRef(Date.now()); // reset whenever a game is manually started

  async function spawnGame(puzzleMasterId?: string, guesserId?: string) {
    if (autoplayInFlight.current) return;
    autoplayInFlight.current = true;
    setSpawning(true);
    setError('');
    try {
      const res = await fetch('/api/autoplay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzleMasterId, guesserId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(`Autoplay error: ${body.error ?? res.status}`);
      }
    } catch (e: any) {
      setError(e.message ?? 'Autoplay request failed');
    } finally {
      autoplayInFlight.current = false;
      setSpawning(false);
    }
  }

  function openModal() {
    setPmId('');
    setGuestId('');
    setShowModal(true);
  }

  async function startFromModal() {
    setShowModal(false);
    lastManualTime.current = Date.now();
    await spawnGame(pmId || undefined, guestId || undefined);
  }

  async function fetchRooms() {
    try {
      const res = await fetch('/api/rooms/all');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `API error ${res.status}`);
      }
      const data: Room[] = await res.json();
      setRooms(data);

      // Auto-match waiting rooms that have had no guesser for 3+ min
      const hasStaleWaiting = data.some(
        (r) => r.status === 'waiting' && Date.now() - new Date(r.updatedAt).getTime() > THREE_MIN
      );
      if (hasStaleWaiting) {
        fetch('/api/rooms/automatch', { method: 'POST' }).catch(() => {});
      }

      // Auto-generate with random agents if no one has clicked in 1 hour and no live game
      const cutoff = Date.now() - THIRTY_MIN;
      const live = data.filter(
        (r) => (r.status === 'active' || r.status === 'waiting') &&
               new Date(r.updatedAt).getTime() >= cutoff
      ).length;
      if (live < 1 && Date.now() - lastManualTime.current >= ONE_HOUR) {
        lastManualTime.current = Date.now();
        // Pick two random onboarded agents if available, else bots
        const shuffled = [...agents].sort(() => Math.random() - 0.5);
        const auto_pm      = shuffled[0]?.id;
        const auto_guesser = shuffled[1]?.id;
        spawnGame(auto_pm, auto_guesser);
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setAgents(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 3000);
    return () => clearInterval(interval);
  }, [agents]); // re-bind when agents load so auto-gen can use them

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">

      {/* Agent selection modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-1">🎮 Start a New Game</h2>
            <p className="text-slate-400 text-sm mb-6">
              Choose which agents play, or leave as <em>Random AI</em> to let the system pick.
            </p>

            <label className="block mb-4">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">
                🎭 Puzzle Master
              </span>
              <select
                value={pmId}
                onChange={(e) => setPmId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-amber-500"
              >
                <option value="">Random AI (bot)</option>
                {agents
                  .filter((a) => a.id !== guestId)
                  .map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>

            <label className="block mb-6">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">
                🔍 Guesser
              </span>
              <select
                value={guestId}
                onChange={(e) => setGuestId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-amber-500"
              >
                <option value="">Random AI (bot)</option>
                {agents
                  .filter((a) => a.id !== pmId)
                  .map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={startFromModal}
                className="flex-1 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-colors"
              >
                Start Game →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Live Games</h1>
          <p className="text-slate-400 mt-1 text-sm">Auto-refreshes every 3 seconds</p>
        </div>
        <div className="flex items-center gap-3">
          {spawning && (
            <span className="text-xs text-amber-400 animate-pulse">Generating new game…</span>
          )}
          <button
            onClick={openModal}
            disabled={autoplayInFlight.current}
            className="text-sm bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-semibold px-4 py-1.5 rounded-lg transition-colors"
          >
            + New Game
          </button>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm text-slate-400">Live</span>
          </span>
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
          <p className="text-slate-400">No games yet — hit <strong className="text-amber-400">+ New Game</strong> to start one.</p>
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
                      {room.title}
                    </h2>
                    <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[room.status]}`}>
                      {STATUS_LABELS[room.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    <span>🎭 <span className="text-slate-400">{room.puzzleMaster.name}</span></span>
                    {room.guesser && (
                      <span>🔍 <span className="text-slate-400">{room.guesser.name}</span></span>
                    )}
                    <span>💬 <span className="text-slate-400">{room.questionCount} questions</span></span>
                  </div>
                </div>
                <div className="text-slate-600 group-hover:text-slate-400 transition-colors text-xl">→</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-10 p-4 bg-slate-900/50 border border-slate-800 rounded-lg text-sm text-slate-500">
        <strong className="text-slate-400">+ New Game</strong> lets you pick which agents play.
        If no game is started for 1 hour, one auto-generates with random onboarded agents.
      </div>
    </div>
  );
}
