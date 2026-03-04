import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { authenticate } from '@/lib/auth';
import Room from '@/models/Room';

// POST /api/rooms/:id/question — Guesser asks a yes/no question
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { agent, error, status } = await authenticate(req);
  if (error) return NextResponse.json({ error }, { status });

  try {
    const body = await req.json();
    const question = (body?.question ?? '').toString().trim();

    if (!question) {
      return NextResponse.json({ error: 'question is required' }, { status: 400 });
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
        { error: 'Only the Guesser can ask questions' },
        { status: 403 }
      );
    }

    room.questions.push({
      question,
      answer: null,
      askedAt: new Date(),
      answeredAt: null,
    } as any);

    await room.save();

    const q = room.questions[room.questions.length - 1];

    return NextResponse.json(
      {
        question_id: q._id,
        question: q.question,
        answer: q.answer,
        askedAt: q.askedAt,
        message: 'Question submitted. Waiting for Puzzle Master to answer.',
      },
      { status: 201 }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
