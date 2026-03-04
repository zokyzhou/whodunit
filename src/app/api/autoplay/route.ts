import '@/lib/models';
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import { connectDB } from '@/lib/mongodb';
import Agent from '@/models/Agent';
import Room from '@/models/Room';

const MODEL = 'claude-haiku-4-5-20251001';

async function chat(client: Anthropic, prompt: string, maxTokens = 1024): Promise<string> {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return (msg.content[0] as any).text.trim();
}

function parseStory(raw: string): { title: string; scenario: string; full_answer: string } {
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  const block = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? cleaned;
  let inString = false, escaped = false, fixed = '';
  for (const ch of block) {
    if (escaped) { fixed += ch; escaped = false; continue; }
    if (ch === '\\') { fixed += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; fixed += ch; continue; }
    if (inString && ch === '\n') { fixed += '\\n'; continue; }
    if (inString && ch === '\r') { fixed += '\\r'; continue; }
    fixed += ch;
  }
  const json = JSON.parse(fixed);
  return {
    title: (json.title ?? 'Untitled Mystery').trim(),
    scenario: (json.scenario ?? '').trim(),
    full_answer: (json.full_answer ?? '').trim(),
  };
}

async function playGame(client: Anthropic, roomId: string, scenario: string, full_answer: string) {
  try {
    await connectDB();
    const room = await Room.findById(roomId);
    if (!room) return;

    const qaLog: string[] = [];
    const STOPWORDS = new Set([
      'their','there','which','would','could','about','where','having',
      'before','after','other','these','those','floor','until','while',
      'since','every','through','because','though','should','without',
    ]);

    for (let i = 0; i < 12; i++) {
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

      const answer = (answerRaw.toLowerCase().match(/\b(yes|no|irrelevant)\b/)?.[1] ?? 'irrelevant') as
        | 'yes' | 'no' | 'irrelevant';

      q.answer = answer;
      q.answeredAt = new Date();
      qaLog.push(`Q${i + 1}: ${q.question} → ${answer}`);
      await room.save();
    }

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

    const keyWords = full_answer.toLowerCase().split(/\W+/).filter((w) => w.length > 4 && !STOPWORDS.has(w));
    const uniqueKeys = [...new Set(keyWords)];
    const matchCount = uniqueKeys.filter((w) => solution.toLowerCase().includes(w)).length;
    const correct = uniqueKeys.length > 0 && matchCount / uniqueKeys.length >= 0.55;

    room.solutionAttempt = solution;
    room.solutionCorrect = correct;
    room.status = correct ? 'solved' : 'failed';
    await room.save();
  } catch (err) {
    console.error('[autoplay/playGame]', err);
    try { await Room.findByIdAndUpdate(roomId, { status: 'failed' }); } catch {}
  }
}

export async function POST() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not set. Add it in Railway → Variables.' },
      { status: 503 }
    );
  }

  try {
    const client = new Anthropic({ apiKey });
    await connectDB();

    const [pm, guesser] = await Promise.all([
      Agent.create({ name: `bot-pm-${Date.now()}`, api_key: uuidv4(), claim_token: uuidv4() }),
      Agent.create({ name: `bot-guesser-${Date.now()}`, api_key: uuidv4(), claim_token: uuidv4() }),
    ]);

    const storyRaw = await chat(
      client,
      `You are a creative writer specialising in lateral thinking puzzles.

Invent a COMPLETELY ORIGINAL mystery — do NOT adapt any well-known puzzle or classic riddle.

Requirements:
- A striking, unexplained event with SPECIFIC named characters, a precise location, and an exact time
- 3–5 red-herring details embedded naturally in the scenario
- One hidden key fact (never mentioned in the scenario) that explains everything
- Consistent internal logic so every yes/no question can be answered truthfully

Return ONLY a JSON object with exactly these three keys (no markdown, no extra text):
{
  "title": "4–6 word intriguing title that does NOT reveal the twist",
  "scenario": "Three paragraphs like a police report. P1: the puzzling event with names/location/time. P2: witness accounts with red herrings. P3: what investigators found. NEVER state the hidden key fact.",
  "full_answer": "4–6 sentences explaining exactly what happened and why, resolving every element."
}`,
      2048
    );

    let title: string, scenario: string, full_answer: string;
    try {
      ({ title, scenario, full_answer } = parseStory(storyRaw));
    } catch (e) {
      console.error('[autoplay] Failed to parse story:', e, '\nRaw:', storyRaw);
      return NextResponse.json({ error: 'Failed to parse story', raw: storyRaw }, { status: 500 });
    }

    if (!scenario.trim() || !full_answer.trim()) {
      return NextResponse.json({ error: 'Incomplete story returned', raw: storyRaw }, { status: 500 });
    }

    const room = await Room.create({
      title,
      scenario,
      full_answer,
      puzzleMaster: pm._id,
      guesser: guesser._id,
      status: 'active',
    });

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

    setTimeout(() => playGame(client, room._id.toString(), scenario, full_answer), 0);

    return NextResponse.json({
      room_id: room._id,
      title,
      status: 'started',
      watch_url: `${appUrl}/rooms/${room._id}`,
    });
  } catch (err: any) {
    console.error('[autoplay] Unexpected error:', err);
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 });
  }
}
