'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Question {
  id: string;
  question: string;
  answer: 'yes' | 'no' | 'irrelevant' | null;
  askedAt: string;
  answeredAt: string | null;
}

interface Room {
  id: string;
  puzzle: {
    id: string;
    title: string;
    scenario: string;
    full_answer?: string;
  };
  puzzleMaster: { id: string; name: string };
  guesser: { id: string; name: string } | null;
  status: 'waiting' | 'active' | 'solved' | 'failed';
  questions: Question[];
  solutionAttempt: string | null;
  solutionCorrect: boolean | null;
  createdAt: string;
  updatedAt: string;
}

const ANSWER_STYLES: Record<string, string> = {
  yes: 'text-green-400 bg-green-900/30 border-green-800',
  no: 'text-red-400 bg-red-900/30 border-red-800',
  irrelevant: 'text-slate-400 bg-slate-800/50 border-slate-700',
};

const ANSWER_LABELS: Record<string, string> = {
  yes: '✓ Yes',
  no: '✗ No',
  irrelevant: '~ Irrelevant',
};

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function fetchRoom() {
    try {
      const res = await fetch(`/api/rooms/${id}/public`);
      if (!res.ok) throw new Error('Room not found');
      const data = await res.json();
      setRoom(data);
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
      <div className="max-w-3xl mx-auto px-6 py-20 text-center text-slate-500">
        Loading…
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <p className="text-red-400">{error || 'Room not found'}</p>
        <Link href="/rooms" className="text-amber-400 text-sm mt-4 inline-block">
          ← Back to rooms
        </Link>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    waiting: 'text-yellow-400',
    active: 'text-blue-400',
    solved: 'text-green-400',
    failed: 'text-red-400',
  };

  const statusLabels: Record<string, string> = {
    waiting: '⏳ Waiting for Guesser',
    active: '🔵 Game in Progress',
    solved: '✅ Solved!',
    failed: '❌ Game Over',
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="mb-6">
        <Link href="/rooms" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
          ← All rooms
        </Link>
      </div>

      {/* Room header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h1 className="text-2xl font-bold text-white">🧩 {room.puzzle.title}</h1>
          <span className={`text-sm font-semibold ${statusColors[room.status]}`}>
            {statusLabels[room.status]}
          </span>
        </div>

        <div className="flex items-center gap-6 text-sm text-slate-500 mb-5">
          <span>🎭 <span className="text-slate-300">{room.puzzleMaster.name}</span> (Puzzle Master)</span>
          {room.guesser && (
            <span>🔍 <span className="text-slate-300">{room.guesser.name}</span> (Guesser)</span>
          )}
        </div>

        <div className="bg-black/40 rounded-lg p-4 border border-slate-800">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-2 font-medium">
            Opening Scenario
          </p>
          <p className="text-slate-200 leading-relaxed">{room.puzzle.scenario}</p>
        </div>
      </div>

      {/* Q&A Transcript */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          💬 Questions & Answers
          <span className="text-sm font-normal text-slate-500">
            ({room.questions.length} total)
          </span>
          {room.status === 'active' && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
          )}
        </h2>

        {room.questions.length === 0 ? (
          <div className="text-center py-12 text-slate-600">
            {room.status === 'waiting'
              ? 'Waiting for a Guesser to join…'
              : 'No questions asked yet.'}
          </div>
        ) : (
          <div className="space-y-3">
            {room.questions.map((q, i) => (
              <div
                key={q.id}
                className="bg-slate-900 border border-slate-800 rounded-lg p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="text-slate-600 text-sm font-mono shrink-0 mt-0.5">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-200 mb-2">{q.question}</p>
                    <div className="flex items-center gap-2">
                      {q.answer ? (
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${ANSWER_STYLES[q.answer]}`}
                        >
                          {ANSWER_LABELS[q.answer]}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600 italic">
                          Awaiting answer…
                        </span>
                      )}
                      <span className="text-xs text-slate-600">
                        {new Date(q.askedAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Result */}
      {(room.status === 'solved' || room.status === 'failed') && (
        <div
          className={`rounded-xl border p-6 mb-6 ${
            room.status === 'solved'
              ? 'bg-green-900/20 border-green-800'
              : 'bg-red-900/20 border-red-800'
          }`}
        >
          <h3 className={`text-lg font-bold mb-3 ${room.status === 'solved' ? 'text-green-400' : 'text-red-400'}`}>
            {room.status === 'solved' ? '🎉 Mystery Solved!' : '❌ Game Over'}
          </h3>

          {room.solutionAttempt && (
            <div className="mb-4">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Guesser's Answer</p>
              <p className="text-slate-200 text-sm">{room.solutionAttempt}</p>
            </div>
          )}

          {room.puzzle.full_answer && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Full Answer</p>
              <p className="text-slate-200 text-sm leading-relaxed">{room.puzzle.full_answer}</p>
            </div>
          )}
        </div>
      )}

      {/* Metadata footer */}
      <div className="text-xs text-slate-600 text-center">
        Room ID: {room.id} · Created {new Date(room.createdAt).toLocaleString()} · Last updated {new Date(room.updatedAt).toLocaleString()}
      </div>
    </div>
  );
}
