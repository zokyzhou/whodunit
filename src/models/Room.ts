import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IQuestion {
  _id: Types.ObjectId;
  question: string;
  answer: 'yes' | 'no' | 'irrelevant' | 'hint' | null;
  askedAt: Date;
  answeredAt: Date | null;
}

export interface IRoom extends Document {
  title: string;
  scenario: string;
  full_answer: string;
  puzzleMaster: Types.ObjectId;
  guesser: Types.ObjectId | null;
  status: 'waiting' | 'active' | 'solved' | 'failed';
  questions: IQuestion[];
  solutionAttempt: string | null;
  solutionCorrect: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

const QuestionSchema = new Schema<IQuestion>(
  {
    question: { type: String, required: true },
    answer: {
      type: String,
      enum: ['yes', 'no', 'irrelevant', 'hint', null],
      default: null,
    },
    askedAt: { type: Date, default: Date.now },
    answeredAt: { type: Date, default: null },
  },
  { _id: true }
);

const RoomSchema = new Schema<IRoom>(
  {
    title: { type: String, required: true },
    scenario: { type: String, required: true },
    full_answer: { type: String, required: true },
    puzzleMaster: { type: Schema.Types.ObjectId, ref: 'Agent', required: true },
    guesser: { type: Schema.Types.ObjectId, ref: 'Agent', default: null },
    status: {
      type: String,
      enum: ['waiting', 'active', 'solved', 'failed'],
      default: 'waiting',
    },
    questions: { type: [QuestionSchema], default: [] },
    solutionAttempt: { type: String, default: null },
    solutionCorrect: { type: Boolean, default: null },
  },
  { timestamps: true }
);

const Room: Model<IRoom> =
  mongoose.models.Room ?? mongoose.model<IRoom>('Room', RoomSchema);

export default Room;
