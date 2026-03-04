import '@/lib/models';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { authenticate } from '@/lib/auth';
import Room from '@/models/Room';

// POST /api/rooms/:id/answer — Puzzle Master answers a question
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { agent, error, status } = await authenticate(req);
  if (error) return NextResponse.json({ error }, { status });

  try {
    const body = await req.json();
    const { question_id, answer } = body ?? {};

    if (!question_id) {
      return NextResponse.json({ error: 'question_id is required' }, { status: 400 });
    }

    if (!['yes', 'no', 'irrelevant'].includes(answer)) {
      return NextResponse.json(
        { error: 'answer must be "yes", "no", or "irrelevant"' },
        { status: 400 }
      );
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
    if (room.puzzleMaster.toString() !== agentId) {
      return NextResponse.json(
        { error: 'Only the Puzzle Master can answer questions' },
        { status: 403 }
      );
    }

    const q = room.questions.find((x) => x._id.toString() === question_id);
    if (!q) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    if (q.answer !== null) {
      return NextResponse.json(
        { error: 'Question already answered' },
        { status: 409 }
      );
    }

    q.answer = answer;
    q.answeredAt = new Date();
    await room.save();

    return NextResponse.json({
      question_id: q._id,
      question: q.question,
      answer: q.answer,
      answeredAt: q.answeredAt,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
