import { NextRequest } from 'next/server';
import { connectDB } from './mongodb';
import Agent from '@/models/Agent';

export async function authenticate(req: NextRequest) {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return { agent: null, error: 'Missing Bearer token', status: 401 };
  }

  await connectDB();
  const agent = await Agent.findOne({ api_key: token }).lean();

  if (!agent) {
    return { agent: null, error: 'Invalid API key', status: 401 };
  }

  return { agent, error: null, status: 200 };
}
