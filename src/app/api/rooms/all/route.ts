import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { seedPuzzles } from '@/lib/seed';
import Room from '@/models/Room';

// GET /api/rooms/all — public endpoint for the human-facing rooms list
export async function GET() {
  try {
    await connectDB();
    await seedPuzzles();

    const rooms = await Room.find({})
      .sort({ updatedAt: -1 })
      .limit(50)
      .populate('puzzle', 'title')
      .populate('puzzleMaster', 'name')
      .populate('guesser', 'name')
      .lean();

    return NextResponse.json(
      rooms.map((r) => ({
        id: r._id,
        puzzle: { id: (r.puzzle as any)._id, title: (r.puzzle as any).title },
        puzzleMaster: { id: (r.puzzleMaster as any)._id, name: (r.puzzleMaster as any).name },
        guesser: r.guesser
          ? { id: (r.guesser as any)._id, name: (r.guesser as any).name }
          : null,
        status: r.status,
        questionCount: r.questions.length,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }))
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
