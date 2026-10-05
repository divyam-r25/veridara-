import mongoose, { Schema, Document } from 'mongoose';

export interface IPullRequest extends Document {
  repositoryId: string;
  githubPrNumber: number;
  title: string;
  body?: string;
  author: string;
  authorAvatarUrl?: string;
  baseSha: string;
  headSha: string;
  baseBranch: string;
  headBranch: string;
  state: 'open' | 'closed' | 'merged';
  githubUrl?: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: Date;
  updatedAt: Date;
  mergedAt?: Date;
}

const PullRequestSchema = new Schema<IPullRequest>({
  repositoryId: { type: String, required: true, index: true },
  githubPrNumber: { type: Number, required: true },
  title: { type: String, required: true },
  body: { type: String },
  author: { type: String, required: true },
  authorAvatarUrl: { type: String },
  baseSha: { type: String, required: true },
  headSha: { type: String, required: true },
  baseBranch: { type: String, required: true },
  headBranch: { type: String, required: true },
  state: { type: String, enum: ['open', 'closed', 'merged'], default: 'open' },
  githubUrl: { type: String },
  additions: { type: Number, default: 0 },
  deletions: { type: Number, default: 0 },
  changedFiles: { type: Number, default: 0 },
  mergedAt: { type: Date }
}, { timestamps: true });

PullRequestSchema.index({ repositoryId: 1, githubPrNumber: 1 }, { unique: true });

export const PullRequest = mongoose.model<IPullRequest>('PullRequest', PullRequestSchema);
