import '@/lib/models';
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';
import { connectDB } from '@/lib/mongodb';
import Agent from '@/models/Agent';
import Room from '@/models/Room';

const MODEL = 'gemini-2.5-flash-lite';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function chat(model: GenerativeModel, prompt: string, maxTokens = 1024): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      });
      const candidate = result.response.candidates?.[0];
      if (candidate?.finishReason === 'MAX_TOKENS') {
        throw new Error(`Response truncated at ${maxTokens} tokens — increase maxTokens`);
      }
      return result.response.text().trim();
    } catch (e: any) {
      const is429 = e?.status === 429 || e?.message?.includes('429') || e?.message?.includes('RESOURCE_EXHAUSTED');
      if (is429 && attempt < 4) {
        const delay = Math.pow(2, attempt) * 5000; // 5s, 10s, 20s, 40s
        console.warn(`[autoplay] Rate limited, waiting ${delay}ms before retry ${attempt + 1}/4...`);
        await sleep(delay);
        continue;
      }
      throw e;
    }
  }
  throw new Error('unreachable');
}

function extractJsonBlock(raw: string): string {
  // Find the first '{' and walk forward with a depth counter to find its matching '}'
  const start = raw.indexOf('{');
  if (start === -1) throw new Error('No "{" found in response');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (!inStr) {
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) return raw.slice(start, i + 1); }
    }
  }
  throw new Error('Unbalanced braces — JSON object never closed');
}

function parseStory(raw: string): { title: string; scenario: string; full_answer: string } {
  // Strip markdown code fences
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
  const block = extractJsonBlock(cleaned);

  // Escape any bare control characters inside string values
  let inString = false, escaped = false, fixed = '';
  for (const ch of block) {
    if (escaped) { fixed += ch; escaped = false; continue; }
    if (ch === '\\') { fixed += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; fixed += ch; continue; }
    if (inString) {
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        if (ch === '\n') { fixed += '\\n'; continue; }
        if (ch === '\r') { fixed += '\\r'; continue; }
        if (ch === '\t') { fixed += '\\t'; continue; }
        fixed += `\\u${code.toString(16).padStart(4, '0')}`;
        continue;
      }
    }
    fixed += ch;
  }

  const json = JSON.parse(fixed);
  return {
    title: (json.title ?? 'Untitled Mystery').trim(),
    scenario: (json.scenario ?? '').trim(),
    full_answer: (json.full_answer ?? '').trim(),
  };
}

async function playGame(model: GenerativeModel, roomId: string, scenario: string, full_answer: string) {
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

    for (let i = 0; i < 8; i++) {
      const question = await chat(
        model,
        `Lateral thinking mystery guesser. Scenario: """${scenario}"""
Q&A so far: ${qaLog.join(' | ') || 'none'}
Ask one unexplored yes/no question (reply with ONLY the question, ending "?").`,
        60
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
        model,
        `Answer: """${full_answer}""" Q: ${q.question}\nReply yes, no, or irrelevant.`,
        10
      );

      const answer = (answerRaw.toLowerCase().match(/\b(yes|no|irrelevant)\b/)?.[1] ?? 'irrelevant') as
        | 'yes' | 'no' | 'irrelevant';

      q.answer = answer;
      q.answeredAt = new Date();
      qaLog.push(`Q${i + 1}: ${q.question} → ${answer}`);
      await room.save();
      await sleep(2000);
    }

    const solution = await chat(
      model,
      `Scenario: """${scenario}""" Q&A: ${qaLog.join(' | ')}\nState the hidden key fact that explains the mystery in 2-3 sentences. Use the same words from the clues above.`,
      150
    );

    const keyWords = full_answer.toLowerCase().split(/\W+/).filter((w) => w.length > 4 && !STOPWORDS.has(w));
    const uniqueKeys = [...new Set(keyWords)];
    const matchCount = uniqueKeys.filter((w) => solution.toLowerCase().includes(w)).length;
    const correct = uniqueKeys.length > 0 && matchCount / uniqueKeys.length >= 0.30;

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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY is not set. Add it in Railway → Variables.' },
      { status: 503 }
    );
  }

  try {
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: MODEL });
    await connectDB();

    // Don't spawn if a game is already running — prevents concurrent rate-limit storms
    const running = await Room.countDocuments({ status: { $in: ['waiting', 'active'] } });
    if (running > 0) {
      return NextResponse.json({ status: 'skipped', reason: 'game already running' });
    }

    const [pm, guesser] = await Promise.all([
      Agent.create({ name: `bot-pm-${Date.now()}`, api_key: uuidv4(), claim_token: uuidv4() }),
      Agent.create({ name: `bot-guesser-${Date.now()}`, api_key: uuidv4(), claim_token: uuidv4() }),
    ]);

    const storyPrompt = `Invent an original lateral thinking mystery (not a classic riddle). Return ONLY valid JSON, no markdown:
{"title":"4-6 word title","scenario":"2 short paragraphs: (1) puzzling event with named characters, location, time; (2) red-herring witness details. Never reveal the hidden key fact.","full_answer":"3-4 sentences revealing the hidden truth. Use simple everyday words — avoid rare vocabulary, jargon, or proper nouns so a guesser can match the core idea with common phrasing."}`;

    async function generateStory(): Promise<{ title: string; scenario: string; full_answer: string; raw: string }> {
      let lastRaw = '';
      let lastErr: unknown;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          lastRaw = await chat(model, storyPrompt, 1024);
          const parsed = parseStory(lastRaw);
          if (!parsed.scenario.trim() || !parsed.full_answer.trim()) {
            throw new Error('Parsed story has empty scenario or full_answer');
          }
          return { ...parsed, raw: lastRaw };
        } catch (e) {
          lastErr = e;
          console.error(`[autoplay] Story attempt ${attempt}/3 failed:`, e, '\nRaw:', lastRaw);
        }
      }
      const errMsg = lastErr instanceof Error ? lastErr.message : String(lastErr);
      throw Object.assign(new Error(errMsg), { raw: lastRaw });
    }

    let story: { title: string; scenario: string; full_answer: string; raw: string };
    try {
      story = await generateStory();
    } catch (e: any) {
      return NextResponse.json(
        {
          error: `Failed to parse story: ${e?.message}`,
          raw_preview: (e?.raw ?? '').slice(0, 500),
        },
        { status: 500 }
      );
    }
    const { title, scenario, full_answer } = story;

    const room = await Room.create({
      title,
      scenario,
      full_answer,
      puzzleMaster: pm._id,
      guesser: guesser._id,
      status: 'active',
    });

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

    setTimeout(() => playGame(model, room._id.toString(), scenario, full_answer), 0);

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
