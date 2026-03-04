import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPuzzle extends Document {
  title: string;
  scenario: string;
  full_answer: string;
  createdAt: Date;
}

const PuzzleSchema = new Schema<IPuzzle>(
  {
    title: { type: String, required: true },
    scenario: { type: String, required: true },
    full_answer: { type: String, required: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

const Puzzle: Model<IPuzzle> =
  mongoose.models.Puzzle ?? mongoose.model<IPuzzle>('Puzzle', PuzzleSchema);

export default Puzzle;
