'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Question {
  id: string;
  question: string;
  answer: 'yes' | 'no' | 'irrelevant' | 'hint' | null;
  askedAt: string;
  answeredAt: string | null;
}

interface Room {
  id: string;
  title: string;
  scenario: string;
  full_answer?: string;
  puzzleMaster: { id: string; name: string };
  guesser: { id: string; name: string } | null;
  status: 'waiting' | 'active' | 'solved' | 'failed';
  questions: Question[];
  solutionAttempt: string | null;
  solutionCorrect: boolean | null;
  createdAt: string;
  updatedAt: string;
}

const ANSWER_BADGE: Record<string, string> = {
  yes:        'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400',
  no:         'bg-red-500/15 border border-red-500/40 text-red-400',
  irrelevant: 'bg-slate-800/60 border border-slate-700/60 text-slate-500',
};

const ANSWER_LABELS: Record<string, string> = {
  yes:        '✓ YES',
  no:         '✕ NO',
  irrelevant: '○ IRREL.',
};

const STATUS_DOT: Record<string, string> = {
  waiting: 'bg-cyan-400',
  active:  'bg-emerald-400',
  solved:  'bg-purple-400',
  failed:  'bg-red-500',
};

const STATUS_LABEL: Record<string, string> = {
  waiting: 'Awaiting Guesser',
  active:  'In Progress',
  solved:  'Case Solved',
  failed:  'Case Closed',
};

const STATUS_COLOR: Record<string, string> = {
  waiting: 'text-cyan-400',
  active:  'text-emerald-400',
  solved:  'text-purple-400',
  failed:  'text-red-400',
};

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const [room,    setRoom]    = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  async function fetchRoom() {
    try {
      const res = await fetch(`/api/rooms/${id}/public`);
      if (!res.ok) throw new Error('Room not found');
      setRoom(await res.json());
    } catch (e: any) {
      setError(e.message ?? 'Failed to load room');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRoom();
    const interval = setInterval(fetchRoom, 2000);
    return () => clearInterval(interval);
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <div className="inline-flex items-center gap-3 text-slate-500">
          <span className="w-2 h-2 rounded-full bg-cyan-500/60 animate-pulse" />
          <span className="font-mono text-sm">Loading case file…</span>
        </div>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <p className="text-red-400 font-mono text-sm mb-4">{error || 'Case not found'}</p>
        <Link href="/rooms" className="text-cyan-400 hover:text-cyan-300 text-sm transition-colors">← Back to investigations</Link>
      </div>
    );
  }

  const answeredCount = room.questions.filter(q => q.answer && q.answer !== 'hint').length;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">

      {/* Back */}
      <div className="mb-6">
        <Link href="/rooms" className="text-slate-600 hover:text-slate-400 text-sm font-mono transition-colors">
          ← all cases
        </Link>
      </div>

      {/* ── Case header ─────────────────────────────────────── */}
      <div className="glass rounded-2xl p-6 mb-5">
        <div className="flex items-center justify-between gap-4 mb-4">
          <span className="text-xs font-mono text-slate-600 tracking-widest">
            CASE #{room.id.slice(-8).toUpperCase()}
          </span>
          <div className={`flex items-center gap-2 text-xs font-mono ${STATUS_COLOR[room.status]}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[room.status]} ${room.status === 'active' ? 'animate-pulse' : ''}`} />
            {STATUS_LABEL[room.status].toUpperCase()}
          </div>
        </div>

        <h1 className="text-2xl md:text-3xl font-bold text-white mb-5 leading-tight">{room.title}</h1>

        <div className="flex flex-wrap gap-4 pb-5 mb-5 border-b border-slate-800/60">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-purple-400/70 tracking-widest">PM</span>
            <span className="text-sm text-slate-300 font-mono">{room.puzzleMaster.name}</span>
          </div>
          {room.guesser && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-cyan-400/70 tracking-widest">GS</span>
              <span className="text-sm text-slate-300 font-mono">{room.guesser.name}</span>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-mono text-slate-600 tracking-[0.2em] uppercase mb-3">◈ Case Brief</p>
          <p className="text-slate-300 leading-relaxed whitespace-pre-line text-sm">{room.scenario}</p>
        </div>
      </div>

      {/* ── Interrogation log ───────────────────────────────── */}
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-4">
          <p className="text-xs font-mono text-slate-600 tracking-[0.2em] uppercase">◈ Interrogation Log</p>
          <span className="text-xs font-mono text-slate-700">{answeredCount} answered</span>
          {room.status === 'active' && (
            <div className="ml-auto flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono text-slate-600">live</span>
            </div>
          )}
        </div>

        {room.questions.length === 0 ? (
          <div className="text-center py-12 glass rounded-xl">
            <p className="text-slate-600 font-mono text-sm">
              {room.status === 'waiting' ? '⟳ Awaiting guesser connection…' : 'No questions filed yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {room.questions.map((q, i) => {
              if (q.answer === 'hint') {
                return (
                  <div key={q.id} className="bg-amber-950/30 border border-amber-700/30 rounded-xl px-4 py-3 flex items-start gap-3">
                    <span className="text-amber-400 shrink-0 mt-0.5">💡</span>
                    <div>
                      <p className="text-xs font-mono text-amber-600 tracking-widest uppercase mb-1">Puzzle Master Hint</p>
                      <p className="text-amber-200/80 text-sm">{q.question}</p>
                    </div>
                  </div>
                );
              }
              return (
                <div key={q.id} className="glass rounded-xl px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-mono text-cyan-600/50 shrink-0 mt-0.5 w-7 text-right">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-200 text-sm mb-2 leading-relaxed">{q.question}</p>
                      <div className="flex items-center gap-3">
                        {q.answer ? (
                          <span className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-md ${ANSWER_BADGE[q.answer]}`}>
                            {ANSWER_LABELS[q.answer]}
                          </span>
                        ) : (
                          <span className="text-xs font-mono text-slate-700 italic flex items-center gap-1.5">
                            <span className="w-1 h-1 rounded-full bg-slate-700 animate-pulse" />
                            awaiting response
                          </span>
                        )}
                        <span className="text-xs font-mono text-slate-700 ml-auto">
                          {new Date(q.askedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Result ──────────────────────────────────────────── */}
      {(room.status === 'solved' || room.status === 'failed') && (
        <div className={`rounded-2xl border p-6 mb-6 ${
          room.status === 'solved'
            ? 'bg-purple-900/15 border-purple-500/30'
            : 'bg-red-900/10 border-red-500/20'
        }`}>
          <div className="flex items-center gap-3 mb-5">
            <span className="text-xl">{room.status === 'solved' ? '🎯' : '📁'}</span>
            <div>
              <p className="text-xs font-mono tracking-widest uppercase text-slate-600 mb-0.5">Case Outcome</p>
              <h3 className={`text-lg font-bold ${room.status === 'solved' ? 'text-purple-400' : 'text-red-400'}`}>
                {room.status === 'solved' ? 'Mystery Solved' : 'Case Closed — Unsolved'}
              </h3>
            </div>
          </div>

          {room.solutionAttempt && (
            <div className="mb-4">
              <p className="text-xs font-mono text-slate-600 tracking-[0.2em] uppercase mb-2">Guesser's Theory</p>
              <p className="text-slate-300 text-sm leading-relaxed glass rounded-xl p-4">{room.solutionAttempt}</p>
            </div>
          )}

          {room.full_answer && (
            <div>
              <p className="text-xs font-mono text-slate-600 tracking-[0.2em] uppercase mb-2">Verified Truth</p>
              <p className="text-slate-300 text-sm leading-relaxed glass rounded-xl p-4 border-l-2 border-l-purple-500/40">{room.full_answer}</p>
            </div>
          )}
        </div>
      )}

      <div className="text-xs font-mono text-slate-700 text-center space-y-1">
        <p>Case ID: {room.id}</p>
        <p>Opened {new Date(room.createdAt).toLocaleString()}</p>
      </div>
    </div>
  );
}
