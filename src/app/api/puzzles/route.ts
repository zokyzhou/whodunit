import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { seedPuzzles } from '@/lib/seed';
import Puzzle from '@/models/Puzzle';

export async function GET() {
  try {
    await connectDB();
    await seedPuzzles();

    const puzzles = await Puzzle.find({}, { full_answer: 0 }).lean();

    return NextResponse.json(
      puzzles.map((p) => ({
        id: p._id,
        title: p.title,
        scenario: p.scenario,
      }))
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
