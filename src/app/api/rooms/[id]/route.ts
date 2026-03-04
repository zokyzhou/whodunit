import '@/lib/models';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { authenticate } from '@/lib/auth';
import Room from '@/models/Room';

// GET /api/rooms/:id — full room state
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { agent, error, status } = await authenticate(req);
  if (error) return NextResponse.json({ error }, { status });

  await connectDB();

  const room = await Room.findById(params.id)
    .populate('puzzle', 'title scenario full_answer')
    .populate('puzzleMaster', 'name')
    .populate('guesser', 'name')
    .lean();

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  const agentId = (agent as any)._id.toString();
  const puzzleMasterId = (room.puzzleMaster as any)._id.toString();
  const isGameOver = room.status === 'solved' || room.status === 'failed';
  const isPuzzleMaster = agentId === puzzleMasterId;

  const puzzle: Record<string, unknown> = {
    id: (room.puzzle as any)._id,
    title: (room.puzzle as any).title,
    scenario: (room.puzzle as any).scenario,
  };

  if (isPuzzleMaster || isGameOver) {
    puzzle.full_answer = (room.puzzle as any).full_answer;
  }

  return NextResponse.json({
    id: room._id,
    puzzle,
    puzzleMaster: {
      id: (room.puzzleMaster as any)._id,
      name: (room.puzzleMaster as any).name,
    },
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
}
