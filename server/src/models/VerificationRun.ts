import mongoose, { Schema, Document } from 'mongoose';

export interface IVerificationCheck {
  name: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'ERROR';
  details?: string;
}

export interface IVerificationRun extends Document {
  analysisRunId: string;
  previousAnalysisId: string;
  repositoryId: string;
  targetSha: string;
  checks: IVerificationCheck[];
  resolvedFindingIds: string[];
  unresolvedFindingIds: string[];
  partiallyResolvedFindingIds: string[];
  newFindingIds: string[];
  regressions: string[];
  result: 'RESOLVED' | 'PARTIAL' | 'REGRESSED' | 'UNRESOLVED' | 'PENDING';
  scoreBefore: number;
  scoreAfter: number;
  securityScoreBefore: number;
  securityScoreAfter: number;
  aiVerificationSummary?: string;
  createdAt: Date;
  updatedAt: Date;
}

const VerificationCheckSchema = new Schema<IVerificationCheck>({
  name: { type: String, required: true },
  status: { type: String, required: true },
  details: { type: String }
}, { _id: false });

const VerificationRunSchema = new Schema<IVerificationRun>({
  analysisRunId: { type: String, required: true, index: true },
  previousAnalysisId: { type: String, required: true },
  repositoryId: { type: String, required: true },
  targetSha: { type: String, required: true },
  checks: [VerificationCheckSchema],
  resolvedFindingIds: [{ type: String }],
  unresolvedFindingIds: [{ type: String }],
  partiallyResolvedFindingIds: [{ type: String }],
  newFindingIds: [{ type: String }],
  regressions: [{ type: String }],
  result: { type: String, default: 'PENDING' },
  scoreBefore: { type: Number, default: 0 },
  scoreAfter: { type: Number, default: 0 },
  securityScoreBefore: { type: Number, default: 0 },
  securityScoreAfter: { type: Number, default: 0 },
  aiVerificationSummary: { type: String }
}, { timestamps: true });

export const VerificationRun = mongoose.model<IVerificationRun>('VerificationRun', VerificationRunSchema);
