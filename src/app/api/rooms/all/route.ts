import '@/lib/models';
import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Room from '@/models/Room';

export async function GET() {
  try {
    await connectDB();

    const rooms = await Room.find({})
      .sort({ updatedAt: -1 })
      .limit(50)
      .populate('puzzleMaster', 'name')
      .populate('guesser', 'name')
      .lean();

    return NextResponse.json(
      rooms.map((r) => ({
        id: r._id,
        title: r.title,
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
  } catch (err: any) {
    console.error('[/api/rooms/all]', err);
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 });
  }
}
