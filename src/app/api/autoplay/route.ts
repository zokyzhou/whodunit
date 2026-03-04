import '@/lib/models';
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import { connectDB } from '@/lib/mongodb';
import Agent from '@/models/Agent';
import Room from '@/models/Room';

export const maxDuration = 300; // 5 min — Railway Pro supports up to 300s

const MODEL = 'claude-haiku-4-5-20251001';

async function chat(client: Anthropic, prompt: string, maxTokens = 512): Promise<string> {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return (msg.content[0] as any).text.trim();
}

export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not set. Add it in Railway → Variables.' },
      { status: 503 }
    );
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  await connectDB();

  // 1. Register two ephemeral bot agents
  const [pm, guesser] = await Promise.all([
    Agent.create({ name: `bot-pm-${Date.now()}`, api_key: uuidv4(), claim_token: uuidv4() }),
    Agent.create({ name: `bot-guesser-${Date.now()}`, api_key: uuidv4(), claim_token: uuidv4() }),
  ]);

  // 2. Puzzle Master generates a completely original mystery
  const storyRaw = await chat(
    client,
    `You are a creative writer specialising in lateral thinking puzzles.

Invent a COMPLETELY ORIGINAL mystery — do NOT adapt any well-known puzzle.
The mystery must have:
- A striking, unexplained event involving specific characters, setting, and time
- 3–5 misleading details or red herrings embedded naturally in the scenario
- One hidden key fact that is never stated but explains everything
- Consistent internal logic so every yes/no question can be answered

Return ONLY valid JSON (no markdown, no prose outside JSON):
{
  "title": "short intriguing title (4–6 words)",
  "scenario": "2–3 paragraph description written like a police report or news story. Hide the key fact completely.",
  "full_answer": "complete, detailed explanation that resolves every element of the scenario"
}`,
    1024
  );

  let title: string, scenario: string, full_answer: string;
  try {
    const json = JSON.parse(storyRaw.match(/\{[\s\S]*\}/)?.[0] ?? storyRaw);
    title = json.title ?? 'Untitled Mystery';
    scenario = json.scenario ?? '';
    full_answer = json.full_answer ?? '';
  } catch {
    return NextResponse.json({ error: 'Failed to parse story from Claude', raw: storyRaw }, { status: 500 });
  }

  if (!scenario || !full_answer) {
    return NextResponse.json({ error: 'Claude returned an incomplete story', raw: storyRaw }, { status: 500 });
  }

  // 3. Create room and have Guesser join
  const room = await Room.create({
    title,
    scenario,
    full_answer,
    puzzleMaster: pm._id,
    guesser: guesser._id,
    status: 'active',
  });

  // 4. Play through questions
  const qaLog: string[] = [];

  for (let i = 0; i < 8; i++) {
    // Guesser asks a question
    const question = await chat(
      client,
      `You are playing a lateral thinking mystery game as the Guesser.

Mystery scenario:
"""
${scenario}
"""

Questions asked so far:
${qaLog.length ? qaLog.join('\n') : '(none yet)'}

Your goal: discover the hidden explanation through yes/no questions.
- Challenge your assumptions about the scenario
- Explore unusual angles: physical traits, hidden disabilities, environmental conditions, unusual professions
- Do NOT ask about the most obvious explanation
- Ask ONE creative yes/no question. Reply with ONLY the question, ending with "?"`,
      120
    );

    room.questions.push({
      question: question.replace(/^["']|["']$/g, ''),
      answer: null,
      askedAt: new Date(),
      answeredAt: null,
    } as any);
    await room.save();

    const q = room.questions[room.questions.length - 1];

    // Puzzle Master answers
    const answerRaw = await chat(
      client,
      `You are the Puzzle Master in a lateral thinking mystery game.

The full answer to the mystery is:
"""
${full_answer}
"""

The Guesser asks: "${q.question}"

Answer truthfully based on the full answer above.
Reply with EXACTLY one word: yes  OR  no  OR  irrelevant`,
      10
    );

    const answer = (answerRaw.toLowerCase().match(/^(yes|no|irrelevant)/)?.[1] ?? 'irrelevant') as
      | 'yes'
      | 'no'
      | 'irrelevant';

    q.answer = answer;
    q.answeredAt = new Date();
    qaLog.push(`Q${i + 1}: ${q.question} → ${answer}`);
    await room.save();
  }

  // 5. Guesser submits a final explanation
  const solution = await chat(
    client,
    `You are the Guesser in a lateral thinking mystery game.

Mystery scenario:
"""
${scenario}
"""

Questions and answers so far:
${qaLog.join('\n')}

Based on everything above, write your FINAL explanation of exactly what happened.
Be specific and account for every detail in the scenario. 2–4 sentences.`,
    300
  );

  // 6. Score
  const STOPWORDS = new Set([
    'their','there','which','would','could','about','where','having',
    'before','after','other','these','those','floor','until','while',
    'since','every','through','because','though','should','without',
  ]);
  const keyWords = full_answer.toLowerCase().split(/\W+/).filter((w) => w.length > 4 && !STOPWORDS.has(w));
  const uniqueKeys = [...new Set(keyWords)];
  const matchCount = uniqueKeys.filter((w) => solution.toLowerCase().includes(w)).length;
  const correct = uniqueKeys.length > 0 && matchCount / uniqueKeys.length >= 0.55;

  room.solutionAttempt = solution;
  room.solutionCorrect = correct;
  room.status = correct ? 'solved' : 'failed';
  await room.save();

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

  return NextResponse.json({
    room_id: room._id,
    title,
    status: room.status,
    correct,
    questions_asked: qaLog.length,
    watch_url: `${appUrl}/rooms/${room._id}`,
  });
}
