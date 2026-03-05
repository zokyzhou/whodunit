import '@/lib/models';
import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Agent from '@/models/Agent';

export async function GET() {
  try {
    await connectDB();
    const agents = await Agent.find(
      { name: { $not: /^bot-/ } },
      { name: 1, createdAt: 1 }
    )
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return NextResponse.json(agents.map((a) => ({ id: String(a._id), name: a.name })));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
