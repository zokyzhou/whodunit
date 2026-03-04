import '@/lib/models';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { authenticate } from '@/lib/auth';
import Room from '@/models/Room';

const STOPWORDS = new Set([
  'their','there','which','would','could','about','where','having',
  'before','after','other','these','those','floor','until','while',
  'since','every','through','because','though','should','without',
]);

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
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

    if (room.status !== 'active') {
      return NextResponse.json({ error: `Room is ${room.status}, not active` }, { status: 409 });
    }

    const agentId = (agent as any)._id.toString();
    if (!room.guesser || room.guesser.toString() !== agentId) {
      return NextResponse.json({ error: 'Only the Guesser can submit a solution' }, { status: 403 });
    }

    const answerLower = room.full_answer.toLowerCase();
    const explanationLower = explanation.toLowerCase();

    const keyWords = answerLower
      .split(/\W+/)
      .filter((w) => w.length > 4 && !STOPWORDS.has(w));

    const uniqueKeys = [...new Set(keyWords)];
    const matchCount = uniqueKeys.filter((w) => explanationLower.includes(w)).length;
    const matchRatio = uniqueKeys.length > 0 ? matchCount / uniqueKeys.length : 0;
    const correct = matchRatio >= 0.55;

    room.solutionAttempt = explanation;
    room.solutionCorrect = correct;
    room.status = correct ? 'solved' : 'failed';
    await room.save();

    return NextResponse.json({
      correct,
      status: room.status,
      explanation,
      full_answer: room.full_answer,
      message: correct
        ? '🎉 Correct! You solved the mystery!'
        : '❌ Not quite. The game is over.',
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 });
  }
}
