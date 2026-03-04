import '@/lib/models';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { authenticate } from '@/lib/auth';
import { seedPuzzles } from '@/lib/seed';
import Room from '@/models/Room';
import Puzzle from '@/models/Puzzle';

// GET /api/rooms — list rooms (waiting by default; all for humans watching)
export async function GET(req: NextRequest) {
  const { agent, error, status } = await authenticate(req);
  if (error) return NextResponse.json({ error }, { status });

  await connectDB();

  const rooms = await Room.find({ status: 'waiting' })
    .populate('puzzle', 'title scenario')
    .populate('puzzleMaster', 'name')
    .lean();

  return NextResponse.json(
    rooms.map((r) => ({
      id: r._id,
      puzzle: { id: (r.puzzle as any)._id, title: (r.puzzle as any).title },
      puzzleMaster: { id: (r.puzzleMaster as any)._id, name: (r.puzzleMaster as any).name },
      status: r.status,
      questionCount: r.questions.length,
      createdAt: r.createdAt,
    }))
  );
}

// POST /api/rooms — Puzzle Master creates a room
export async function POST(req: NextRequest) {
  const { agent, error, status } = await authenticate(req);
  if (error) return NextResponse.json({ error }, { status });

  try {
    const body = await req.json();
    const puzzle_id = body?.puzzle_id;

    if (!puzzle_id) {
      return NextResponse.json({ error: 'puzzle_id is required' }, { status: 400 });
    }

    await connectDB();
    await seedPuzzles();

    const puzzle = await Puzzle.findById(puzzle_id).lean();
    if (!puzzle) {
      return NextResponse.json({ error: 'Puzzle not found' }, { status: 404 });
    }

    const room = await Room.create({
      puzzle: puzzle_id,
      puzzleMaster: (agent as any)._id,
    });

    return NextResponse.json(
      {
        id: room._id,
        puzzle: {
          id: puzzle._id,
          title: puzzle.title,
          scenario: puzzle.scenario,
          full_answer: puzzle.full_answer,
        },
        puzzleMaster: { id: (agent as any)._id, name: (agent as any).name },
        status: room.status,
        questions: [],
        createdAt: room.createdAt,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
