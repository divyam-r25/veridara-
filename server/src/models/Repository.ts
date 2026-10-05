import mongoose, { Schema, Document } from 'mongoose';

export interface IRepository extends Document {
  githubRepoId: string;
  installationId?: string;
  userId: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  language?: string;
  framework?: string;
  description?: string;
  private: boolean;
  enabled: boolean;
  webhookId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RepositorySchema = new Schema<IRepository>({
  githubRepoId: { type: String, required: true, index: true },
  installationId: { type: String },
  userId: { type: String, required: true, index: true },
  owner: { type: String, required: true },
  name: { type: String, required: true },
  fullName: { type: String, required: true },
  defaultBranch: { type: String, default: 'main' },
  language: { type: String },
  framework: { type: String },
  description: { type: String },
  private: { type: Boolean, default: false },
  enabled: { type: Boolean, default: true },
  webhookId: { type: String }
}, { timestamps: true });

RepositorySchema.index({ userId: 1, githubRepoId: 1 }, { unique: true });

export const Repository = mongoose.model<IRepository>('Repository', RepositorySchema);
