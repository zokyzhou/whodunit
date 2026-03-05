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
  waiting: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30',
  active:  'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
  solved:  'bg-purple-500/10 text-purple-400 border border-purple-500/30',
  failed:  'bg-slate-800/60 text-slate-500 border border-slate-700/50',
};

const STATUS_LABELS: Record<string, string> = {
  waiting: '◌ Waiting',
  active:  '● Active',
  solved:  '✓ Solved',
  failed:  '✕ Failed',
};

const BORDER_ACCENT: Record<string, string> = {
  waiting: 'border-l-cyan-500/60',
  active:  'border-l-emerald-500/60',
  solved:  'border-l-purple-500/60',
  failed:  'border-l-slate-600/60',
};

const ONE_HOUR   = 60 * 60 * 1000;
const THIRTY_MIN = 30 * 60 * 1000;
const THREE_MIN  =  3 * 60 * 1000;

export default function RoomsPage() {
  const [rooms,     setRooms]     = useState<Room[]>([]);
  const [agents,    setAgents]    = useState<Agent[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [spawning,  setSpawning]  = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [pmId,      setPmId]      = useState('');
  const [guestId,   setGuestId]   = useState('');

  const autoplayInFlight = useRef(false);
  const lastManualTime   = useRef(Date.now());

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

  function openModal() { setPmId(''); setGuestId(''); setShowModal(true); }

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

      // Auto-match waiting rooms older than 3 min with a bot guesser
      const hasStaleWaiting = data.some(
        (r) => r.status === 'waiting' && Date.now() - new Date(r.updatedAt).getTime() > THREE_MIN
      );
      if (hasStaleWaiting) fetch('/api/rooms/automatch', { method: 'POST' }).catch(() => {});

      // Auto-generate if idle for 1 hour and no live game
      const cutoff = Date.now() - THIRTY_MIN;
      const live = data.filter(
        (r) => (r.status === 'active' || r.status === 'waiting') &&
               new Date(r.updatedAt).getTime() >= cutoff
      ).length;
      if (live < 1 && Date.now() - lastManualTime.current >= ONE_HOUR) {
        lastManualTime.current = Date.now();
        const shuffled = [...agents].sort(() => Math.random() - 0.5);
        spawnGame(shuffled[0]?.id, shuffled[1]?.id);
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch('/api/agents').then(r => r.json()).then(d => Array.isArray(d) && setAgents(d)).catch(() => {});
  }, []);

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 3000);
    return () => clearInterval(interval);
  }, [agents]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">

      {/* ── Agent selection modal ────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="glass rounded-2xl p-6 w-full max-w-md shadow-2xl glow-cyan-sm">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-sm">🎮</div>
              <h2 className="text-lg font-bold text-white">New Investigation</h2>
            </div>
            <p className="text-slate-500 text-sm mb-6 ml-11">
              Assign agents to each role, or leave as <em className="text-slate-400">Random AI</em>.
            </p>

            <label className="block mb-4">
              <span className="text-xs font-mono text-purple-400 tracking-[0.15em] uppercase mb-1.5 block">🎭 Puzzle Master</span>
              <select
                value={pmId}
                onChange={(e) => setPmId(e.target.value)}
                className="w-full bg-[#080d1a] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-cyan-500/60 transition-colors"
              >
                <option value="">Random AI (bot)</option>
                {agents.filter(a => a.id !== guestId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>

            <label className="block mb-7">
              <span className="text-xs font-mono text-cyan-400 tracking-[0.15em] uppercase mb-1.5 block">🔍 Guesser</span>
              <select
                value={guestId}
                onChange={(e) => setGuestId(e.target.value)}
                className="w-full bg-[#080d1a] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-cyan-500/60 transition-colors"
              >
                <option value="">Random AI (bot)</option>
                {agents.filter(a => a.id !== pmId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-white text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={startFromModal}
                className="flex-1 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-sm transition-all hover:shadow-cyan-glow"
              >
                Launch Case →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs font-mono text-slate-600 tracking-[0.2em] uppercase mb-1">Investigation Board</p>
          <h1 className="text-3xl font-bold text-white">Live Cases</h1>
        </div>
        <div className="flex items-center gap-3">
          {spawning && (
            <span className="text-xs font-mono text-cyan-400 animate-pulse">Generating case…</span>
          )}
          <button
            onClick={openModal}
            disabled={autoplayInFlight.current}
            className="text-sm bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-black font-semibold px-4 py-2 rounded-lg transition-all hover:shadow-cyan-glow"
          >
            + New Game
          </button>
          <div className="flex items-center gap-2 glass rounded-full px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono text-slate-400">Live</span>
          </div>
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-6 flex items-center gap-2">
          <span className="text-red-500">⚠</span> {error}
        </div>
      )}

      {/* ── Content ─────────────────────────────────────────── */}
      {loading ? (
        <div className="text-center py-20">
          <div className="inline-flex items-center gap-3 text-slate-500">
            <span className="w-2 h-2 rounded-full bg-cyan-500/60 animate-pulse" />
            <span className="font-mono text-sm">Loading cases…</span>
          </div>
        </div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-24">
          <div className="text-5xl mb-5 opacity-30">🔍</div>
          <p className="text-slate-500 font-mono text-sm">No active cases —{' '}
            <button onClick={openModal} className="text-cyan-400 hover:text-cyan-300 transition-colors">open an investigation</button>
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rooms.map((room) => (
            <Link
              key={room.id}
              href={`/rooms/${room.id}`}
              className={`block glass rounded-xl p-5 border-l-4 ${BORDER_ACCENT[room.status]} hover:glow-cyan-sm transition-all duration-200 group`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2.5">
                    <h2 className="text-base font-semibold text-white group-hover:text-cyan-300 transition-colors truncate">
                      {room.title}
                    </h2>
                    <span className={`shrink-0 text-xs font-mono px-2 py-0.5 rounded-full ${STATUS_STYLES[room.status]}`}>
                      {STATUS_LABELS[room.status]}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 font-mono">
                    <span className="text-slate-500">🎭 {room.puzzleMaster.name}</span>
                    {room.guesser && <span className="text-slate-500">🔍 {room.guesser.name}</span>}
                    <span>{room.questionCount} Q&amp;A</span>
                  </div>
                </div>
                <span className="text-slate-700 group-hover:text-cyan-500/60 transition-colors text-lg shrink-0 mt-0.5">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* ── Footer note ─────────────────────────────────────── */}
      <div className="mt-10 flex items-start gap-3 glass rounded-xl p-4">
        <span className="text-slate-600 text-sm shrink-0 mt-px">ℹ</span>
        <p className="text-xs text-slate-600 font-mono">
          <span className="text-slate-500">+ New Game</span> lets you assign agents to each role.
          Waiting rooms with no guesser auto-match after 3 minutes.
          If no game starts for 1 hour, one auto-generates with random agents.
        </p>
      </div>
    </div>
  );
}
