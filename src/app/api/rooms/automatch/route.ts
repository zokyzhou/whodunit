import '@/lib/models';
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';
import { connectDB } from '@/lib/mongodb';
import Agent from '@/models/Agent';
import Room from '@/models/Room';

const MODEL = 'gemini-2.5-flash';
const MATCH_AFTER_MS = 3 * 60 * 1000; // auto-match after 3 min with no guesser

const STOPWORDS = new Set([
  'their','there','which','would','could','about','where','having',
  'before','after','other','these','those','floor','until','while',
  'since','every','through','because','though','should','without',
]);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function chat(model: GenerativeModel, prompt: string, maxTokens = 1024): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      });
      const candidate = result.response.candidates?.[0];
      if (candidate?.finishReason === 'MAX_TOKENS') throw new Error('Response truncated');
      return result.response.text().trim();
    } catch (e: any) {
      const status = e?.status ?? e?.httpStatus;
      const msg: string = e?.message ?? '';
      const isRetryable =
        status === 429 || status === 500 || status === 502 || status === 503 ||
        msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('502') || msg.includes('503') || msg.includes('overloaded');
      if (isRetryable && attempt < 4) { await sleep(Math.pow(2, attempt) * 3000); continue; }
      throw e;
    }
  }
  throw new Error('unreachable');
}

async function botGuesserLoop(model: GenerativeModel, roomId: string, scenario: string) {
  try {
    await connectDB();
    const qaLog: string[] = [];

    for (let i = 0; i < 12; i++) {
      const room = await Room.findById(roomId);
      if (!room || room.status !== 'active') return;

      // Ask a question
      const question = await chat(
        model,
        `Lateral thinking mystery. Scenario: """${scenario}"""
Q&A: ${qaLog.join(' | ') || 'none'}
Find the ONE hidden fact. Ask a sharp yes/no question — challenge assumptions about who the person really is, what the object actually is, or when/why the event happened. Reply with ONLY the question.`,
        80
      );

      room.questions.push({
        question: question.replace(/^["']|["']$/g, ''),
        answer: null,
        askedAt: new Date(),
        answeredAt: null,
      } as any);
      await room.save();

      const qIdx = room.questions.length - 1;

      // Poll up to 2.5 min for the PM to answer (30 × 5 s)
      let answeredText: string | null = null;
      for (let poll = 0; poll < 30; poll++) {
        await sleep(5000);
        const updated = await Room.findById(roomId);
        if (!updated || updated.status !== 'active') return;
        const q = updated.questions[qIdx];
        if (q && q.answer !== null) { answeredText = q.answer; break; }
      }
      if (answeredText === null) break; // PM not responding — give up

      qaLog.push(`Q${i + 1}: ${question.replace(/^["']|["']$/g, '')} → ${answeredText}`);
      await sleep(1000);
    }

    // Submit solution
    const room = await Room.findById(roomId);
    if (!room || room.status !== 'active') return;

    const solution = await chat(
      model,
      `Scenario: """${scenario}""" Q&A: ${qaLog.join(' | ')}
Based on the clues, state the hidden key fact that explains the mystery in 3-4 sentences. Be specific.`,
      250
    );

    const keyWords = room.full_answer.toLowerCase().split(/\W+/).filter(
      (w) => w.length > 4 && !STOPWORDS.has(w)
    );
    const uniqueKeys = [...new Set(keyWords)];
    const matchCount = uniqueKeys.filter((w) => solution.toLowerCase().includes(w)).length;
    const correct = uniqueKeys.length > 0 && matchCount / uniqueKeys.length >= 0.30;

    room.solutionAttempt = solution;
    room.solutionCorrect = correct;
    room.status = correct ? 'solved' : 'failed';
    await room.save();
  } catch (err) {
    console.error('[automatch/botGuesserLoop]', err);
    try { await Room.findByIdAndUpdate(roomId, { status: 'failed' }); } catch {}
  }
}

export async function POST() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ skipped: true });

  try {
    await connectDB();
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: MODEL });
    const cutoff = new Date(Date.now() - MATCH_AFTER_MS);
    let matched = 0;

    // Process up to 5 rooms per call (atomic claim to prevent double-matching)
    for (let i = 0; i < 5; i++) {
      const guesser = await Agent.create({
        name: `bot-guesser-${Date.now()}`,
        api_key: uuidv4(),
        claim_token: uuidv4(),
      });

      const room = await Room.findOneAndUpdate(
        { status: 'waiting', updatedAt: { $lt: cutoff } },
        { $set: { status: 'active', guesser: guesser._id } },
        { new: false }
      );

      if (!room) {
        // No room to match — remove unused agent
        await Agent.findByIdAndDelete(guesser._id);
        break;
      }

      setTimeout(() => botGuesserLoop(model, room._id.toString(), room.scenario), 0);
      matched++;
    }

    return NextResponse.json({ matched });
  } catch (err: any) {
    console.error('[automatch]', err);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
