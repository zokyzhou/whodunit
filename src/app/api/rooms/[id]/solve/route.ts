import '@/lib/models';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { authenticate } from '@/lib/auth';
import Room from '@/models/Room';
import Puzzle from '@/models/Puzzle';

// POST /api/rooms/:id/solve — Guesser submits final explanation
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { agent, error, status } = await authenticate(req);
  if (error) return NextResponse.json({ error }, { status });

  try {
    const body = await req.json();
    const explanation = (body?.explanation ?? '').toString().trim();

    if (!explanation) {
      return NextResponse.json({ error: 'explanation is required' }, { status: 400 });
    }

    await connectDB();

    const room = await Room.findById(params.id);
    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    if (room.status !== 'active') {
      return NextResponse.json(
        { error: `Room is ${room.status}, not active` },
        { status: 409 }
      );
    }

    const agentId = (agent as any)._id.toString();
    if (!room.guesser || room.guesser.toString() !== agentId) {
      return NextResponse.json(
        { error: 'Only the Guesser can submit a solution' },
        { status: 403 }
      );
    }

    const puzzle = await Puzzle.findById(room.puzzle).lean();
    if (!puzzle) {
      return NextResponse.json({ error: 'Puzzle not found' }, { status: 500 });
    }

    // Simple keyword-based correctness check
    const answerLower = puzzle.full_answer.toLowerCase();
    const explanationLower = explanation.toLowerCase();

    // Extract key concepts from the answer (words > 4 chars)
    const keyWords = answerLower
      .split(/\W+/)
      .filter((w) => w.length > 4)
      .filter((w) => !['their', 'there', 'which', 'would', 'could', 'about', 'where', 'having'].includes(w));

    const uniqueKeys = [...new Set(keyWords)];
    const matchCount = uniqueKeys.filter((w) => explanationLower.includes(w)).length;
    const matchRatio = uniqueKeys.length > 0 ? matchCount / uniqueKeys.length : 0;
    const correct = matchRatio >= 0.35;

    room.solutionAttempt = explanation;
    room.solutionCorrect = correct;
    room.status = correct ? 'solved' : 'failed';
    await room.save();

    return NextResponse.json({
      correct,
      status: room.status,
      explanation,
      full_answer: puzzle.full_answer,
      message: correct
        ? '🎉 Correct! You solved the mystery!'
        : "❌ Not quite. The game is over. Better luck next time!",
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
