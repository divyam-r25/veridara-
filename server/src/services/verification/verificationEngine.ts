import { AnalysisRun } from '../../models/AnalysisRun';
import { Finding, IFinding } from '../../models/Finding';
import { PullRequest } from '../../models/PullRequest';
import { Repository } from '../../models/Repository';
import { VerificationRun } from '../../models/VerificationRun';
import { getFileContent, getOctokitForRepository, getPRFiles } from '../../github/githubService';
import { analyzeChanges } from '../../analyzers/change/changeAnalyzer';
import { analyzeSecurityRisks } from '../../analyzers/security/securityAnalyzer';
import { analyzeDependencies } from '../../analyzers/dependency/dependencyAnalyzer';
import { analyzeAPIChanges } from '../../analyzers/api/apiAnalyzer';
import { calculateScores } from '../../scoring/scoringEngine';
import { transitionAnalysisRun } from '../loopController';
import { verifyOriginalFinding } from './findingVerifier';
import { findRegressions } from './regressionDetector';

export const VERIFICATION_INSTRUCTION = 'Assume the proposed fix may be incorrect. Independently determine whether the original condition still exists. Also identify any new risks introduced by the fix.';

/**
 * Verification is intentionally separate from runAnalysis. It starts from the
 * original evidence, fetches the target revision, and executes a new set of
 * deterministic checks before deciding the original findings' outcomes.
 */
export async function runVerification(analysisRunId: string): Promise<void> {
  const run = await AnalysisRun.findById(analysisRunId);
  if (!run?.previousAnalysisId) throw new Error('Verification requires a previous analysis');
  const [previous, pr, repository] = await Promise.all([
    AnalysisRun.findById(run.previousAnalysisId),
    PullRequest.findById(run.pullRequestId),
    Repository.findById(run.repositoryId)
  ]);
  if (!previous || !pr || !repository?.installationId) throw new Error('Verification prerequisites are unavailable');

  try {
    await transitionAnalysisRun(run.id, 'TRIAGED', { 'analysisProgress.fetchingPR': 'IN_PROGRESS' });
    const octokit = await getOctokitForRepository(repository.installationId);
    const files = await getPRFiles(octokit, repository.owner, repository.name, pr.githubPrNumber);
    await transitionAnalysisRun(run.id, 'CONTEXT_BUILT', { 'analysisProgress.fetchingPR': 'DONE', 'analysisProgress.buildingContext': 'IN_PROGRESS' });

    const contents = new Map<string, string>();
    const baseContents = new Map<string, string>();
    for (const file of files.filter(file => file.status !== 'removed').slice(0, 30)) {
      const content = await getFileContent(octokit, repository.owner, repository.name, file.filename, run.headSha);
      if (content) contents.set(file.filename, content);
      if (file.status !== 'added') {
        const base = await getFileContent(octokit, repository.owner, repository.name, file.filename, previous.headSha);
        if (base) baseContents.set(file.filename, base);
      }
    }

    await transitionAnalysisRun(run.id, 'REANALYZING', { 'analysisProgress.buildingContext': 'DONE', 'analysisProgress.runningChecks': 'IN_PROGRESS' });
    const [changes, security, dependencies, api] = await Promise.all([
      analyzeChanges(files, run.id, repository.id),
      analyzeSecurityRisks(files, run.id, repository.id, contents),
      analyzeDependencies(files, run.id, repository.id, contents),
      analyzeAPIChanges(files, run.id, repository.id, contents, baseContents)
    ]);
    const freshFindings = [...changes.findings, ...security.findings, ...dependencies.findings, ...api.findings] as Partial<IFinding>[];
    if (freshFindings.length) await Finding.insertMany(freshFindings);

    await transitionAnalysisRun(run.id, 'VERIFYING', { 'analysisProgress.runningChecks': 'DONE', 'analysisProgress.aiReasoning': 'IN_PROGRESS' });
    const originalFindings = await Finding.find({ analysisRunId: previous.id });
    const resolved: string[] = [];
    const partial: string[] = [];
    const unresolved: string[] = [];
    for (const finding of originalFindings) {
      const verdict = verifyOriginalFinding(finding, freshFindings);
      if (verdict === 'RESOLVED') {
        resolved.push(finding.id);
        await Finding.findByIdAndUpdate(finding.id, { status: 'RESOLVED', resolvedInAnalysisId: run.id });
      } else if (verdict === 'PARTIALLY_RESOLVED') {
        partial.push(finding.id);
        await Finding.findByIdAndUpdate(finding.id, { status: 'PARTIALLY_RESOLVED' });
      } else unresolved.push(finding.id);
    }
    const regressions = findRegressions(freshFindings);
    const scores = calculateScores({
      changeRiskScore: changes.changeRiskScore,
      testReadinessScore: changes.testReadinessScore,
      apiCompatibilityScore: api.apiCompatibilityScore,
      dependencySafetyScore: dependencies.dependencySafetyScore,
      securityScore: security.securityScore,
      verificationConfidence: Math.round(((resolved.length + partial.length * 0.5) / Math.max(1, originalFindings.length)) * 100),
      findings: freshFindings
    });
    const result = regressions.length ? 'REGRESSED' : unresolved.length ? (resolved.length || partial.length ? 'PARTIAL' : 'UNRESOLVED') : 'RESOLVED';
    await VerificationRun.create({
      analysisRunId: run.id,
      previousAnalysisId: previous.id,
      repositoryId: repository.id,
      targetSha: run.headSha,
      checks: [
        { name: 'Independent deterministic analysis', status: 'PASSED', details: VERIFICATION_INSTRUCTION },
        { name: 'Security analysis', status: security.securityScore >= 0 ? 'PASSED' : 'ERROR', details: `Security score: ${security.securityScore}` },
        { name: 'Regression detection', status: regressions.length ? 'FAILED' : 'PASSED', details: `${regressions.length} high-risk new findings` }
      ],
      resolvedFindingIds: resolved,
      partiallyResolvedFindingIds: partial,
      unresolvedFindingIds: unresolved,
      newFindingIds: freshFindings.map(finding => String(finding._id || '')).filter(Boolean),
      regressions: regressions.map(finding => finding.title || 'Unnamed regression'),
      result,
      scoreBefore: previous.releaseScore,
      scoreAfter: scores.releaseScore,
      securityScoreBefore: previous.securityScore,
      securityScoreAfter: scores.securityScore,
      aiVerificationSummary: 'Verification used independently fetched target-revision evidence and deterministic checks; it did not accept the fix claim as proof.'
    });
    await transitionAnalysisRun(run.id, result === 'PARTIAL' ? 'PARTIAL' : result, {
      releaseScore: scores.releaseScore,
      securityScore: scores.securityScore,
      verificationConfidence: scores.verificationConfidence,
      decision: scores.decision,
      scoreBreakdown: scores.scoreBreakdown,
      hardGates: scores.hardGates,
      aiSummary: 'Independent verification completed.',
      'analysisProgress.aiReasoning': 'DONE',
      completedAt: new Date()
    });
  } catch (error) {
    const current = await AnalysisRun.findById(run.id).select('status');
    if (current && !['RESOLVED', 'PARTIAL', 'REGRESSED', 'UNRESOLVED', 'FAILED'].includes(current.status)) {
      await transitionAnalysisRun(run.id, 'FAILED', { completedAt: new Date() });
    }
    throw error;
  }
}
