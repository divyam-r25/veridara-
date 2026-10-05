import mongoose, { Schema, Document } from 'mongoose';

export interface IFixPack extends Document {
  analysisRunId: string;
  repositoryId: string;
  content: string;
  version: number;
  findingIds: string[];
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FixPackSchema = new Schema<IFixPack>({
  analysisRunId: { type: String, required: true, index: true },
  repositoryId: { type: String, required: true },
  content: { type: String, required: true },
  version: { type: Number, default: 1 },
  findingIds: [{ type: String }],
  generatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export const FixPack = mongoose.model<IFixPack>('FixPack', FixPackSchema);
