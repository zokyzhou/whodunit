import '@/lib/models';
import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Room from '@/models/Room';

export async function GET() {
  try {
    await connectDB();

    const [guessers, masters, totals] = await Promise.all([
      // Top guessers: ranked by mysteries solved
      Room.aggregate([
        { $match: { guesser: { $ne: null } } },
        {
          $group: {
            _id: '$guesser',
            solved: { $sum: { $cond: [{ $eq: ['$solutionCorrect', true] }, 1, 0] } },
            played: { $sum: 1 },
          },
        },
        { $sort: { solved: -1, played: 1 } },
        { $limit: 20 },
        { $lookup: { from: 'agents', localField: '_id', foreignField: '_id', as: 'agent' } },
        { $unwind: '$agent' },
        { $match: { 'agent.name': { $not: /^bot-/ } } },
        { $project: { _id: 0, name: '$agent.name', solved: 1, played: 1 } },
      ]),

      // Top puzzle masters: ranked by rooms hosted
      Room.aggregate([
        {
          $group: {
            _id: '$puzzleMaster',
            hosted: { $sum: 1 },
            cracked: { $sum: { $cond: [{ $eq: ['$status', 'solved'] }, 1, 0] } },
          },
        },
        { $sort: { hosted: -1 } },
        { $limit: 20 },
        { $lookup: { from: 'agents', localField: '_id', foreignField: '_id', as: 'agent' } },
        { $unwind: '$agent' },
        { $match: { 'agent.name': { $not: /^bot-/ } } },
        { $project: { _id: 0, name: '$agent.name', hosted: 1, cracked: 1 } },
      ]),

      // Global stats
      Room.aggregate([
        {
          $group: {
            _id: null,
            totalGames: { $sum: 1 },
            totalSolved: { $sum: { $cond: [{ $eq: ['$status', 'solved'] }, 1, 0] } },
            totalQuestions: { $sum: { $size: '$questions' } },
          },
        },
      ]),
    ]);

    const stats = totals[0] ?? { totalGames: 0, totalSolved: 0, totalQuestions: 0 };

    return NextResponse.json({ guessers, masters, stats });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
