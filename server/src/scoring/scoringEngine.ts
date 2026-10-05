import { IFinding } from '../models/Finding';
import { ReleaseDecision, IScoreBreakdown } from '../models/AnalysisRun';

interface ScoringInput {
  changeRiskScore: number;
  testReadinessScore: number;
  apiCompatibilityScore: number;
  dependencySafetyScore: number;
  securityScore: number;
  verificationConfidence: number;
  findings: Partial<IFinding>[];
}

interface ScoringResult {
  releaseScore: number;
  securityScore: number;
  verificationConfidence: number;
  decision: ReleaseDecision;
  scoreBreakdown: IScoreBreakdown;
  hardGates: string[];
  scoreExplanation: ScoreExplanationItem[];
}

export interface ScoreExplanationItem {
  dimension: string;
  score: number;
  weight: number;
  contribution: number;
  explanation: string;
}

const WEIGHTS = {
  changeRisk: 0.20,
  testReadiness: 0.20,
  apiCompatibility: 0.15,
  dependencySafety: 0.10,
  securityScore: 0.25,
  verificationConfidence: 0.10
};

function determineDecision(
  releaseScore: number,
  hardGates: string[]
): ReleaseDecision {
  // Hard gates override numerical score
  if (hardGates.length > 0) return 'BLOCKED';

  if (releaseScore >= 90) return 'READY';
  if (releaseScore >= 80) return 'READY_WITH_REVIEW';
  if (releaseScore >= 65) return 'REVIEW_REQUIRED';
  if (releaseScore >= 40) return 'HIGH_RISK';
  return 'BLOCKED';
}

function calculateHardGates(findings: Partial<IFinding>[]): string[] {
  const gates: string[] = [];

  const criticalSecurityFindings = findings.filter(
    f => f.category === 'SECURITY' && f.severity === 'CRITICAL' && (f.confidence || 0) >= 0.7
  );

  for (const finding of criticalSecurityFindings) {
    gates.push(`Critical security finding: ${finding.title}`);
  }

  // Secret exposure is always a hard gate
  const secretFindings = findings.filter(
    f => f.title?.toLowerCase().includes('secret') ||
         f.title?.toLowerCase().includes('credential') ||
         f.title?.toLowerCase().includes('exposed') ||
         f.title?.toLowerCase().includes('api key')
  );

  if (secretFindings.length > 0) {
    if (!gates.find(g => g.includes('security'))) {
      gates.push(`Potential secret/credential exposure detected`);
    }
  }

  return gates;
}

export function calculateScores(input: ScoringInput): ScoringResult {
  const {
    changeRiskScore,
    testReadinessScore,
    apiCompatibilityScore,
    dependencySafetyScore,
    securityScore,
    verificationConfidence,
    findings
  } = input;

  // Calculate weighted release score
  const releaseScore = Math.round(
    changeRiskScore * WEIGHTS.changeRisk +
    testReadinessScore * WEIGHTS.testReadiness +
    apiCompatibilityScore * WEIGHTS.apiCompatibility +
    dependencySafetyScore * WEIGHTS.dependencySafety +
    securityScore * WEIGHTS.securityScore +
    verificationConfidence * WEIGHTS.verificationConfidence
  );

  const hardGates = calculateHardGates(findings);
  const decision = determineDecision(releaseScore, hardGates);

  const scoreBreakdown: IScoreBreakdown = {
    changeRisk: Math.round(changeRiskScore),
    testReadiness: Math.round(testReadinessScore),
    apiCompatibility: Math.round(apiCompatibilityScore),
    dependencySafety: Math.round(dependencySafetyScore),
    securityScore: Math.round(securityScore),
    verificationConfidence: Math.round(verificationConfidence)
  };

  const scoreExplanation: ScoreExplanationItem[] = [
    {
      dimension: 'Change Risk',
      score: changeRiskScore,
      weight: WEIGHTS.changeRisk,
      contribution: Math.round(changeRiskScore * WEIGHTS.changeRisk),
      explanation: getChangeRiskExplanation(changeRiskScore, findings)
    },
    {
      dimension: 'Test Readiness',
      score: testReadinessScore,
      weight: WEIGHTS.testReadiness,
      contribution: Math.round(testReadinessScore * WEIGHTS.testReadiness),
      explanation: getTestReadinessExplanation(testReadinessScore, findings)
    },
    {
      dimension: 'API Compatibility',
      score: apiCompatibilityScore,
      weight: WEIGHTS.apiCompatibility,
      contribution: Math.round(apiCompatibilityScore * WEIGHTS.apiCompatibility),
      explanation: apiCompatibilityScore === 100 ? 'No API breaking changes detected' : 'Potential breaking API changes detected'
    },
    {
      dimension: 'Dependency Safety',
      score: dependencySafetyScore,
      weight: WEIGHTS.dependencySafety,
      contribution: Math.round(dependencySafetyScore * WEIGHTS.dependencySafety),
      explanation: dependencySafetyScore === 100 ? 'No dependency issues detected' : 'Dependency changes require review'
    },
    {
      dimension: 'Security',
      score: securityScore,
      weight: WEIGHTS.securityScore,
      contribution: Math.round(securityScore * WEIGHTS.securityScore),
      explanation: getSecurityExplanation(securityScore, findings)
    },
    {
      dimension: 'Verification',
      score: verificationConfidence,
      weight: WEIGHTS.verificationConfidence,
      contribution: Math.round(verificationConfidence * WEIGHTS.verificationConfidence),
      explanation: verificationConfidence === 0 ? 'Awaiting verification' : `Verification confidence: ${verificationConfidence}%`
    }
  ];

  return {
    releaseScore: Math.min(100, Math.max(0, releaseScore)),
    securityScore: Math.min(100, Math.max(0, Math.round(securityScore))),
    verificationConfidence: Math.min(100, Math.max(0, Math.round(verificationConfidence))),
    decision,
    scoreBreakdown,
    hardGates,
    scoreExplanation
  };
}

function getChangeRiskExplanation(score: number, findings: Partial<IFinding>[]): string {
  const infraFindings = findings.filter(f => f.category === 'INFRASTRUCTURE');
  if (infraFindings.length > 0) return `CI/CD or infrastructure changes detected (${infraFindings.length} findings)`;
  if (score >= 90) return 'Low change risk: few files in safe areas';
  if (score >= 70) return 'Moderate change risk: some high-risk files changed';
  return 'High change risk: large scope or sensitive files changed';
}

function getTestReadinessExplanation(score: number, findings: Partial<IFinding>[]): string {
  const testFindings = findings.filter(f => f.category === 'TESTING');
  if (testFindings.length > 0) return `Test gaps detected: ${testFindings[0].title}`;
  if (score >= 90) return 'Good test coverage for changed files';
  return 'Missing tests for changed code';
}

function getSecurityExplanation(score: number, findings: Partial<IFinding>[]): string {
  const criticalCount = findings.filter(f => f.category === 'SECURITY' && f.severity === 'CRITICAL').length;
  const highCount = findings.filter(f => f.category === 'SECURITY' && f.severity === 'HIGH').length;

  if (criticalCount > 0) return `${criticalCount} critical security finding(s) detected`;
  if (highCount > 0) return `${highCount} high severity security finding(s) detected`;
  if (score >= 90) return 'No significant security issues detected';
  return 'Security issues require attention';
}

// Calculate verification confidence based on what checks were run
export function calculateVerificationConfidence(
  checksRun: string[],
  checksTotal: string[],
  unresolvedFindings: number,
  totalFindings: number
): number {
  if (checksTotal.length === 0) return 0;

  const checkCompleteness = checksRun.length / checksTotal.length;
  const resolutionRate = totalFindings > 0 ? 1 - (unresolvedFindings / totalFindings) : 1;

  const confidence = (checkCompleteness * 0.6 + resolutionRate * 0.4) * 100;
  return Math.round(Math.min(100, Math.max(0, confidence)));
}
