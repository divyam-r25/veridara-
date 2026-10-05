import mongoose, { Schema, Document } from 'mongoose';

export type FindingCategory =
  | 'SECURITY'
  | 'CORRECTNESS'
  | 'TESTING'
  | 'API'
  | 'DEPENDENCY'
  | 'INFRASTRUCTURE'
  | 'AI_CONTEXT'
  | 'ARCHITECTURE';

export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type FindingStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'PARTIALLY_RESOLVED'
  | 'REGRESSED'
  | 'WONT_FIX';

export type DetectionMethod =
  | 'STATIC_ANALYSIS'
  | 'SECURITY_RULE'
  | 'DEPENDENCY_AUDIT'
  | 'AI_ASSESSMENT'
  | 'HEURISTIC'
  | 'PATTERN_MATCH';

export interface IEvidence {
  file: string;
  startLine?: number;
  endLine?: number;
  snippet?: string;
  description: string;
}

export interface IFinding extends Document {
  analysisRunId: string;
  repositoryId: string;
  category: FindingCategory;
  severity: FindingSeverity;
  confidence: number;
  title: string;
  summary: string;
  evidence: IEvidence[];
  affectedFiles: string[];
  impact: string;
  recommendation: string;
  suggestedTests: string[];
  verificationCriteria: string[];
  detectionMethod: DetectionMethod;
  status: FindingStatus;
  resolvedInAnalysisId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EvidenceSchema = new Schema<IEvidence>({
  file: { type: String, required: true },
  startLine: { type: Number },
  endLine: { type: Number },
  snippet: { type: String },
  description: { type: String, required: true }
}, { _id: false });

const FindingSchema = new Schema<IFinding>({
  analysisRunId: { type: String, required: true, index: true },
  repositoryId: { type: String, required: true, index: true },
  category: { type: String, required: true },
  severity: { type: String, required: true },
  confidence: { type: Number, required: true, min: 0, max: 1 },
  title: { type: String, required: true },
  summary: { type: String, required: true },
  evidence: [EvidenceSchema],
  affectedFiles: [{ type: String }],
  impact: { type: String, required: true },
  recommendation: { type: String, required: true },
  suggestedTests: [{ type: String }],
  verificationCriteria: [{ type: String }],
  detectionMethod: { type: String, required: true },
  status: { type: String, default: 'OPEN' },
  resolvedInAnalysisId: { type: String }
}, { timestamps: true });

export const Finding = mongoose.model<IFinding>('Finding', FindingSchema);
