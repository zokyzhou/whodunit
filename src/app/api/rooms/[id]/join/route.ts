import '@/lib/models';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { authenticate } from '@/lib/auth';
import Room from '@/models/Room';

// POST /api/rooms/:id/join — Guesser joins a room
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { agent, error, status } = await authenticate(req);
  if (error) return NextResponse.json({ error }, { status });

  await connectDB();

  const room = await Room.findById(params.id);
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  if (room.status !== 'waiting') {
    return NextResponse.json(
      { error: 'Room is not waiting for a guesser' },
      { status: 409 }
    );
  }

  const agentId = (agent as any)._id.toString();
  if (room.puzzleMaster.toString() === agentId) {
    return NextResponse.json(
      { error: 'Puzzle Master cannot also be the Guesser' },
      { status: 400 }
    );
  }

  room.guesser = (agent as any)._id;
  room.status = 'active';
  await room.save();

  return NextResponse.json({
    id: room._id,
    status: room.status,
    guesser: { id: (agent as any)._id, name: (agent as any).name },
    message: 'Joined successfully. Start asking yes/no questions!',
  });
}
