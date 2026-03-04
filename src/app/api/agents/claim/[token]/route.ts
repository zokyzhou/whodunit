import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Agent from '@/models/Agent';

// GET /api/agents/claim/:token — look up agent by claim token
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    await connectDB();

    const agent = await Agent.findOne({ claim_token: params.token }).lean();
    if (!agent) {
      return NextResponse.json({ error: 'Invalid claim token' }, { status: 404 });
    }

    return NextResponse.json({
      agent_id: agent._id,
      name: agent.name,
      api_key: agent.api_key,
      createdAt: agent.createdAt,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
