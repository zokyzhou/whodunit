import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAgent extends Document {
  name: string;
  api_key: string;
  claim_token: string;
  createdAt: Date;
}

const AgentSchema = new Schema<IAgent>(
  {
    name: { type: String, required: true },
    api_key: { type: String, required: true, unique: true, index: true },
    claim_token: { type: String, required: true, unique: true, index: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

const Agent: Model<IAgent> =
  mongoose.models.Agent ?? mongoose.model<IAgent>('Agent', AgentSchema);

export default Agent;
