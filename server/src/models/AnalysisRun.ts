import mongoose, { Schema, Document } from 'mongoose';

export type AnalysisStatus =
  | 'RECEIVED'
  | 'TRIAGED'
  | 'CONTEXT_BUILT'
  | 'ANALYZING'
  | 'FINDINGS_READY'
  | 'FIX_PLAN_READY'
  | 'AWAITING_FIX'
  | 'REANALYZING'
  | 'VERIFYING'
  | 'RESOLVED'
  | 'PARTIAL'
  | 'REGRESSED'
  | 'UNRESOLVED'
  | 'COMPLETED'
  | 'FAILED'
  | 'PARTIALLY_COMPLETED';

export type ReleaseDecision =
  | 'READY'
  | 'READY_WITH_REVIEW'
  | 'REVIEW_REQUIRED'
  | 'HIGH_RISK'
  | 'BLOCKED';

export interface IScoreBreakdown {
  changeRisk: number;
  testReadiness: number;
  apiCompatibility: number;
  dependencySafety: number;
  securityScore: number;
  verificationConfidence: number;
}

export interface IAnalysisRun extends Document {
  pullRequestId: string;
  repositoryId: string;
  iterationNumber: number;
  baseSha: string;
  headSha: string;
  previousAnalysisId?: string;
  status: AnalysisStatus;
  releaseScore: number;
  securityScore: number;
  verificationConfidence: number;
  decision: ReleaseDecision;
  scoreBreakdown: IScoreBreakdown;
  executiveSummary?: string;
  aiSummary?: string;
  hardGates: string[];
  changedFiles: number;
  linesAdded: number;
  linesRemoved: number;
  analysisProgress: Record<string, string>;
  aiAvailable: boolean;
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AnalysisRunSchema = new Schema<IAnalysisRun>({
  pullRequestId: { type: String, required: true, index: true },
  repositoryId: { type: String, required: true, index: true },
  iterationNumber: { type: Number, default: 1 },
  baseSha: { type: String, required: true },
  headSha: { type: String, required: true, index: true },
  previousAnalysisId: { type: String },
  status: { type: String, required: true, default: 'RECEIVED' },
  releaseScore: { type: Number, default: 0 },
  securityScore: { type: Number, default: 0 },
  verificationConfidence: { type: Number, default: 0 },
  decision: { type: String, default: 'REVIEW_REQUIRED' },
  scoreBreakdown: {
    changeRisk: { type: Number, default: 50 },
    testReadiness: { type: Number, default: 50 },
    apiCompatibility: { type: Number, default: 0 },
    dependencySafety: { type: Number, default: 0 },
    securityScore: { type: Number, default: 0 },
    verificationConfidence: { type: Number, default: 0 }
  },
  executiveSummary: { type: String },
  aiSummary: { type: String },
  hardGates: [{ type: String }],
  changedFiles: { type: Number, default: 0 },
  linesAdded: { type: Number, default: 0 },
  linesRemoved: { type: Number, default: 0 },
  analysisProgress: { type: Map, of: String, default: {} },
  aiAvailable: { type: Boolean, default: false },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date }
}, { timestamps: true });

export const AnalysisRun = mongoose.model<IAnalysisRun>('AnalysisRun', AnalysisRunSchema);
