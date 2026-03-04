import '@/lib/models';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Room from '@/models/Room';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB();

    const room = await Room.findById(params.id)
      .populate('puzzleMaster', 'name')
      .populate('guesser', 'name')
      .lean();

    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

    const isGameOver = room.status === 'solved' || room.status === 'failed';

    return NextResponse.json({
      id: room._id,
      title: room.title,
      scenario: room.scenario,
      ...(isGameOver ? { full_answer: room.full_answer } : {}),
      puzzleMaster: { id: (room.puzzleMaster as any)._id, name: (room.puzzleMaster as any).name },
      guesser: room.guesser
        ? { id: (room.guesser as any)._id, name: (room.guesser as any).name }
        : null,
      status: room.status,
      questions: room.questions.map((q) => ({
        id: q._id,
        question: q.question,
        answer: q.answer,
        askedAt: q.askedAt,
        answeredAt: q.answeredAt,
      })),
      solutionAttempt: room.solutionAttempt,
      solutionCorrect: room.solutionCorrect,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 });
  }
}
