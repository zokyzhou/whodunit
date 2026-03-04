import '@/lib/models';
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';
import { connectDB } from '@/lib/mongodb';
import Agent from '@/models/Agent';
import Room from '@/models/Room';

const MODEL = 'gemini-2.5-flash';

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
      const status = e?.status ?? e?.httpStatus;
      const msg: string = e?.message ?? '';
      const isRetryable =
        status === 429 || status === 500 || status === 502 || status === 503 ||
        msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('502') || msg.includes('503') || msg.includes('overloaded');
      if (isRetryable && attempt < 4) {
        const delay = Math.pow(2, attempt) * 3000; // 3s, 6s, 12s, 24s
        console.warn(`[autoplay] Transient error (${status ?? msg.slice(0, 40)}), retrying in ${delay}ms...`);
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
    let noCount = 0;
    const STOPWORDS = new Set([
      'their','there','which','would','could','about','where','having',
      'before','after','other','these','those','floor','until','while',
      'since','every','through','because','though','should','without',
    ]);

    for (let i = 0; i < 12; i++) {
      const question = await chat(
        model,
        `Lateral thinking mystery. Scenario: """${scenario}"""
Q&A: ${qaLog.join(' | ') || 'none'}
Find the ONE hidden fact that explains everything. Ask a sharp yes/no question — challenge assumptions about who the person really is, what the object actually is, or when/why the event happened. Reply with ONLY the question.`,
        80
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

      if (answer === 'no') {
        noCount++;
        if (noCount % 3 === 0) {
          const hint = await chat(
            model,
            `Full answer: """${full_answer}""" The guesser is stuck after several "no" answers. Give one short cryptic hint (1 sentence) that nudges toward the hidden key fact without revealing it directly.`,
            80
          );
          room.questions.push({
            question: hint,
            answer: 'hint',
            askedAt: new Date(),
            answeredAt: new Date(),
          } as any);
          qaLog.push(`HINT: ${hint}`);
          await room.save();
        }
      }

      await sleep(2000);
    }

    const solution = await chat(
      model,
      `Scenario: """${scenario}""" Q&A: ${qaLog.join(' | ')}\nBased on the clues, state the hidden key fact that explains the mystery in 3-4 sentences. Be specific — name what the person really is/does, or what the object/event actually was.`,
      250
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

    // Mark rooms stuck in 'active' for >30 min as failed (Railway restarts kill playGame callbacks).
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    await Room.updateMany(
      { status: { $in: ['waiting', 'active'] }, createdAt: { $lt: cutoff } },
      { $set: { status: 'failed' } }
    );

    // Don't spawn if a recent game is already running.
    const running = await Room.countDocuments({
      status: { $in: ['waiting', 'active'] },
      createdAt: { $gte: cutoff },
    });
    if (running > 0) {
      return NextResponse.json({ status: 'skipped', reason: 'game already running' });
    }

    const [pm, guesser] = await Promise.all([
      Agent.create({ name: `bot-pm-${Date.now()}`, api_key: uuidv4(), claim_token: uuidv4() }),
      Agent.create({ name: `bot-guesser-${Date.now()}`, api_key: uuidv4(), claim_token: uuidv4() }),
    ]);

    const storyPrompt = `You are a lateral thinking puzzle master. Invent a completely original mystery with a satisfying twist. Return ONLY valid JSON, no markdown:
{"title":"5-8 word intriguing title that hints without revealing","scenario":"2 vivid paragraphs: (1) a bizarre specific event with named characters, exact location and time — make it genuinely puzzling; (2) misleading witness accounts and red herrings that seem important but aren't. Never state the hidden key fact.","full_answer":"The surprising hidden truth in 3-5 sentences using plain everyday words. It must completely reframe the scenario and be discoverable through yes/no questions about common facts."}
The hidden key fact must hinge on one of: a mistaken assumption about a person (job, disability, relationship), an object used unexpectedly, or a timeline misunderstanding. Keep it fair — all clues consistent with the truth.`;

    async function generateStory(): Promise<{ title: string; scenario: string; full_answer: string; raw: string }> {
      let lastRaw = '';
      let lastErr: unknown;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          lastRaw = await chat(model, storyPrompt, 2048);
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
