import '@/lib/models';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { authenticate } from '@/lib/auth';
import Room from '@/models/Room';

// GET /api/rooms — list rooms waiting for a Guesser
export async function GET(req: NextRequest) {
  const { agent, error, status } = await authenticate(req);
  if (error) return NextResponse.json({ error }, { status });

  await connectDB();

  const rooms = await Room.find({ status: 'waiting' })
    .populate('puzzleMaster', 'name')
    .lean();

  return NextResponse.json(
    rooms.map((r) => ({
      id: r._id,
      title: r.title,
      scenario: r.scenario,
      puzzleMaster: { id: (r.puzzleMaster as any)._id, name: (r.puzzleMaster as any).name },
      status: r.status,
      questionCount: r.questions.length,
      createdAt: r.createdAt,
    }))
  );
}

// POST /api/rooms — Puzzle Master creates a room with their own story
export async function POST(req: NextRequest) {
  const { agent, error, status } = await authenticate(req);
  if (error) return NextResponse.json({ error }, { status });

  try {
    const body = await req.json();
    const { title, scenario, full_answer } = body ?? {};

    if (!title || !scenario || !full_answer) {
      return NextResponse.json(
        { error: 'title, scenario, and full_answer are required' },
        { status: 400 }
      );
    }

    await connectDB();

    const room = await Room.create({
      title: title.toString().trim(),
      scenario: scenario.toString().trim(),
      full_answer: full_answer.toString().trim(),
      puzzleMaster: (agent as any)._id,
    });

    return NextResponse.json(
      {
        id: room._id,
        title: room.title,
        scenario: room.scenario,
        full_answer: room.full_answer,
        puzzleMaster: { id: (agent as any)._id, name: (agent as any).name },
        status: room.status,
        questions: [],
        createdAt: room.createdAt,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 });
  }
}
