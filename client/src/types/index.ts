// API types matching server models

export type AnalysisStatus =
  | 'RECEIVED' | 'TRIAGED' | 'CONTEXT_BUILT' | 'ANALYZING'
  | 'FINDINGS_READY' | 'FIX_PLAN_READY' | 'AWAITING_FIX'
  | 'REANALYZING' | 'VERIFYING' | 'RESOLVED' | 'PARTIAL'
  | 'REGRESSED' | 'UNRESOLVED' | 'COMPLETED' | 'FAILED' | 'PARTIALLY_COMPLETED';

export type ReleaseDecision =
  | 'READY' | 'READY_WITH_REVIEW' | 'REVIEW_REQUIRED' | 'HIGH_RISK' | 'BLOCKED';

export type FindingCategory =
  | 'SECURITY' | 'CORRECTNESS' | 'TESTING' | 'API'
  | 'DEPENDENCY' | 'INFRASTRUCTURE' | 'AI_CONTEXT' | 'ARCHITECTURE';

export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type FindingStatus =
  | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'PARTIALLY_RESOLVED' | 'REGRESSED' | 'WONT_FIX';

export interface User {
  id: string;
  username: string;
  email?: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface Repository {
  _id: string;
  id: string;
  githubRepoId: string;
  installationId?: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  language?: string;
  framework?: string;
  description?: string;
  private: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PullRequest {
  _id: string;
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface ScoreBreakdown {
  changeRisk: number;
  testReadiness: number;
  apiCompatibility: number;
  dependencySafety: number;
  securityScore: number;
  verificationConfidence: number;
}

export interface AnalysisRun {
  _id: string;
  id: string;
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
  scoreBreakdown: ScoreBreakdown;
  executiveSummary?: string;
  aiSummary?: string;
  hardGates: string[];
  changedFiles: number;
  linesAdded: number;
  linesRemoved: number;
  analysisProgress: Record<string, string>;
  aiAvailable: boolean;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Evidence {
  file: string;
  startLine?: number;
  endLine?: number;
  snippet?: string;
  description: string;
}

export interface Finding {
  _id: string;
  id: string;
  analysisRunId: string;
  repositoryId: string;
  category: FindingCategory;
  severity: FindingSeverity;
  confidence: number;
  title: string;
  summary: string;
  evidence: Evidence[];
  affectedFiles: string[];
  impact: string;
  recommendation: string;
  suggestedTests: string[];
  verificationCriteria: string[];
  detectionMethod: string;
  status: FindingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FixPack {
  _id: string;
  id: string;
  analysisRunId: string;
  content: string;
  version: number;
  generatedAt: string;
}

export interface VerificationRun {
  _id: string;
  id: string;
  analysisRunId: string;
  previousAnalysisId: string;
  result: 'RESOLVED' | 'PARTIAL' | 'REGRESSED' | 'UNRESOLVED' | 'PENDING';
  scoreBefore: number;
  scoreAfter: number;
  securityScoreBefore: number;
  securityScoreAfter: number;
  resolvedFindingIds: string[];
  unresolvedFindingIds: string[];
  regressions: string[];
  aiVerificationSummary?: string;
  checks: Array<{ name: string; status: string; details?: string }>;
  createdAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  demoMode?: boolean;
  githubAppConfigured?: boolean;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description?: string;
  private: boolean;
  language?: string;
  default_branch: string;
  stargazers_count?: number;
  updated_at?: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  body?: string;
  state: string;
  user?: { login: string; avatar_url: string };
  author?: string;
  head?: { sha: string; ref: string };
  base?: { sha: string; ref: string };
  additions?: number;
  deletions?: number;
  changed_files?: number;
  changedFiles?: number;
  headSha?: string;
  baseSha?: string;
}
