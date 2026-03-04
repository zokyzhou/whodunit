import '@/lib/models';
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';
import { connectDB } from '@/lib/mongodb';
import Agent from '@/models/Agent';
import Room from '@/models/Room';

const MODEL = 'gemini-1.5-flash';

async function chat(genAI: GoogleGenerativeAI, prompt: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: MODEL });
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

async function chatJSON(genAI: GoogleGenerativeAI, prompt: string): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: { responseMimeType: 'application/json' } as any,
  });
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

/** Escape literal newlines inside JSON string values so JSON.parse succeeds. */
function fixJsonStrings(raw: string): string {
  let inString = false;
  let escaped = false;
  let out = '';
  for (const ch of raw) {
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === '\\') { out += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; out += ch; continue; }
    if (inString && ch === '\n') { out += '\\n'; continue; }
    if (inString && ch === '\r') { out += '\\r'; continue; }
    out += ch;
  }
  return out;
}

function parseStory(raw: string): { title: string; scenario: string; full_answer: string } {
  const block = raw.match(/\{[\s\S]*\}/)?.[0] ?? raw;
  let json: any;
  try {
    json = JSON.parse(block);
  } catch {
    json = JSON.parse(fixJsonStrings(block));
  }
  return {
    title: (json.title ?? 'Untitled Mystery').trim(),
    scenario: (json.scenario ?? '').trim(),
    full_answer: (json.full_answer ?? '').trim(),
  };
}

/** Plays through Q&A and scores the game. Runs in the background after POST returns. */
async function playGame(
  genAI: GoogleGenerativeAI,
  roomId: string,
  scenario: string,
  full_answer: string
) {
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
        genAI,
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

Ask ONE creative yes/no question. Reply with ONLY the question, ending with "?"`
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
        genAI,
        `You are the Puzzle Master in a lateral thinking mystery game.

The full answer to the mystery is:
"""
${full_answer}
"""

The Guesser asks: "${q.question}"

Answer truthfully based on the full answer above.
Reply with EXACTLY one word: yes  OR  no  OR  irrelevant`
      );

      const answer = (answerRaw.toLowerCase().match(/\b(yes|no|irrelevant)\b/)?.[1] ?? 'irrelevant') as
        | 'yes'
        | 'no'
        | 'irrelevant';

      q.answer = answer;
      q.answeredAt = new Date();
      qaLog.push(`Q${i + 1}: ${q.question} → ${answer}`);
      await room.save();
    }

    // Guesser submits final explanation
    const solution = await chat(
      genAI,
      `You are the Guesser in a lateral thinking mystery game.

Mystery scenario:
"""
${scenario}
"""

Questions and answers so far:
${qaLog.join('\n')}

Based on everything above, write your FINAL explanation of exactly what happened.
Be specific and account for every detail in the scenario. 2–4 sentences.`
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
    try {
      await Room.findByIdAndUpdate(roomId, { status: 'failed' });
    } catch {}
  }
}

export async function POST() {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY is not set. Add it in Railway → Variables.' },
      { status: 503 }
    );
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    await connectDB();

    // 1. Register two ephemeral bot agents
    const [pm, guesser] = await Promise.all([
      Agent.create({ name: `bot-pm-${Date.now()}`, api_key: uuidv4(), claim_token: uuidv4() }),
      Agent.create({ name: `bot-guesser-${Date.now()}`, api_key: uuidv4(), claim_token: uuidv4() }),
    ]);

    // 2. Generate original mystery (~3-5s)
    const storyRaw = await chatJSON(
      genAI,
      `You are a creative writer specialising in lateral thinking puzzles.

Invent a COMPLETELY ORIGINAL mystery — do NOT adapt any well-known puzzle or classic riddle.

Requirements:
- A striking, unexplained event with SPECIFIC named characters, a precise location, and an exact time
- 3–5 red-herring details that seem significant but are false leads
- One hidden key fact (never mentioned in the scenario) that recontextualises everything
- Consistent internal logic so EVERY yes/no question can be answered truthfully from full_answer

Return a JSON object with exactly these keys:
{
  "title": "4–6 word intriguing title that does NOT reveal the twist",
  "scenario": "Three full paragraphs separated by blank lines. Written like a police report. Paragraph 1: the puzzling event with specific names/location/time. Paragraph 2: witness accounts and physical details with red herrings. Paragraph 3: what investigators found. NEVER state the hidden key fact.",
  "full_answer": "4–6 sentences explaining exactly what happened and why, resolving every element."
}`
    );

    let title: string, scenario: string, full_answer: string;
    try {
      ({ title, scenario, full_answer } = parseStory(storyRaw));
    } catch (e) {
      console.error('[autoplay] Failed to parse story:', e, '\nRaw:', storyRaw);
      return NextResponse.json({ error: 'Failed to parse story from Gemini', raw: storyRaw }, { status: 500 });
    }

    if (!scenario.trim() || !full_answer.trim()) {
      return NextResponse.json({ error: 'Gemini returned an incomplete story', raw: storyRaw }, { status: 500 });
    }

    // 3. Create room — visible as 'active' immediately
    const room = await Room.create({
      title,
      scenario,
      full_answer,
      puzzleMaster: pm._id,
      guesser: guesser._id,
      status: 'active',
    });

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

    // 4. Play the game in the background
    setTimeout(() => playGame(genAI, room._id.toString(), scenario, full_answer), 0);

    // 5. Return immediately
    return NextResponse.json({
      room_id: room._id,
      title,
      status: 'started',
      watch_url: `${appUrl}/rooms/${room._id}`,
    });
  } catch (err: any) {
    console.error('[autoplay] Unexpected error:', err);
    return NextResponse.json(
      { error: err?.message ?? 'Internal server error' },
      { status: 500 }
    );
  }
}
