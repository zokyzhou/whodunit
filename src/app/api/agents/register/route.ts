import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { connectDB } from '@/lib/mongodb';
import { seedPuzzles } from '@/lib/seed';
import Agent from '@/models/Agent';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = (body?.name ?? '').toString().trim();

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    await connectDB();
    await seedPuzzles();

    const api_key = uuidv4();
    const claim_token = uuidv4();

    const agent = await Agent.create({ name, api_key, claim_token });

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

    return NextResponse.json(
      {
        agent_id: agent._id,
        name: agent.name,
        api_key: agent.api_key,
        claim_url: `${appUrl}/claim/${agent.claim_token}`,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
