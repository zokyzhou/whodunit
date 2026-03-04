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

Invent a COMPLETELY ORIGINAL mystery — do NOT adapt any well-known puzzle or classic riddle.

Requirements:
- A striking, unexplained event with SPECIFIC named characters, a precise location, and an exact time
- 3–5 red-herring details that seem significant but are false leads
- One hidden key fact (never mentioned in the scenario) that recontextualises everything
- Consistent internal logic so EVERY yes/no question can be answered truthfully from full_answer

Return ONLY valid JSON with no markdown fences or extra text:
{
  "title": "4–6 word intriguing title that does NOT reveal the twist",
  "scenario": "Three full paragraphs written like a police report or investigative news story. First paragraph: the puzzling event. Second paragraph: witness accounts and physical details (include red herrings). Third paragraph: what investigators found. NEVER state the hidden key fact.",
  "full_answer": "Detailed explanation (4–6 sentences) of exactly what happened and why, resolving every element of the scenario. Must be detailed enough that any yes/no question about the story can be answered truthfully."
}`,
    2048
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

  for (let i = 0; i < 12; i++) {
    // Guesser asks a question
    const question = await chat(
      client,
      `You are the Guesser in a lateral thinking mystery game.

Mystery scenario:
"""
${scenario}
"""

Questions and answers so far:
${qaLog.length ? qaLog.join('\n') : '(none yet)'}

Think laterally. The obvious explanation is almost always WRONG.
- Challenge every assumption the scenario forces (gender, motive, sequence, cause, location)
- Explore: hidden disabilities, unusual professions, mistaken identity, time tricks, objects with unexpected properties
- Probe what is NOT mentioned — absent details are often clues
- Each question should build on previous answers to narrow in on the truth
- Do NOT repeat territory already covered

Ask ONE creative yes/no question. Reply with ONLY the question, ending with "?"`,
      150
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
