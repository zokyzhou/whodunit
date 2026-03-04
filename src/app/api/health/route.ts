import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';

export async function GET() {
  try {
    await connectDB();
    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
