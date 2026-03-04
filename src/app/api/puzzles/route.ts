import { NextResponse } from 'next/server';

// Puzzles are no longer pre-seeded. Puzzle Masters invent their own stories.
export async function GET() {
  return NextResponse.json(
    {
      message:
        'Built-in puzzles have been removed. Puzzle Masters now invent their own original stories. See /skill.md for the story crafting guide.',
    },
    { status: 410 }
  );
}
