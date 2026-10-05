import { AnalysisRun } from '../models/AnalysisRun';
import { Finding } from '../models/Finding';
import { FixPack } from '../models/FixPack';
import { PullRequest } from '../models/PullRequest';
import { Repository } from '../models/Repository';
import { VerificationRun } from '../models/VerificationRun';
import { analyzeChanges } from '../analyzers/change/changeAnalyzer';
import { analyzeSecurityRisks } from '../analyzers/security/securityAnalyzer';
import { analyzeDependencies } from '../analyzers/dependency/dependencyAnalyzer';
import { analyzeAPIChanges } from '../analyzers/api/apiAnalyzer';
import { calculateScores } from '../scoring/scoringEngine';
import { generateFixPack } from '../reports/fixPackGenerator';
import { DEMO_FILES, DEMO_FILE_CONTENTS, DEMO_FIXED_FILES } from './demoData';
import { logger } from '../utils/logger';

export async function runDemoAnalysis(
  analysisRunId: string,
  pullRequestId: string,
  repositoryId: string
): Promise<void> {
  logger.info(`Running demo analysis ${analysisRunId}`);

  try {
    const pr = await PullRequest.findById(pullRequestId);
    const repo = await Repository.findById(repositoryId);

    if (!pr || !repo) throw new Error('PR or repo not found');

    await AnalysisRun.findByIdAndUpdate(analysisRunId, {
      status: 'TRIAGED',
      'analysisProgress.fetchingPR': 'DONE'
    });

    await sleep(800);

    await AnalysisRun.findByIdAndUpdate(analysisRunId, {
      status: 'CONTEXT_BUILT',
      'analysisProgress.buildingContext': 'DONE'
    });

    await sleep(600);

    await AnalysisRun.findByIdAndUpdate(analysisRunId, {
      status: 'ANALYZING',
      'analysisProgress.runningChecks': 'IN_PROGRESS'
    });

    // Run all analyzers with demo data
    const [changeResult, securityResult, dependencyResult, apiResult] = await Promise.all([
      analyzeChanges(DEMO_FILES, analysisRunId, repositoryId),
      analyzeSecurityRisks(DEMO_FILES, analysisRunId, repositoryId, DEMO_FILE_CONTENTS),
      analyzeDependencies(DEMO_FILES, analysisRunId, repositoryId, DEMO_FILE_CONTENTS),
      analyzeAPIChanges(DEMO_FILES, analysisRunId, repositoryId, DEMO_FILE_CONTENTS, new Map())
    ]);

    await sleep(500);

    await AnalysisRun.findByIdAndUpdate(analysisRunId, {
      'analysisProgress.runningChecks': 'DONE',
      'analysisProgress.aiReasoning': 'IN_PROGRESS'
    });

    await sleep(1200);

    await AnalysisRun.findByIdAndUpdate(analysisRunId, {
      'analysisProgress.aiReasoning': 'DONE',
      'analysisProgress.calculatingScore': 'IN_PROGRESS'
    });

    // Combine findings
    const allFindings = [
      ...changeResult.findings,
      ...securityResult.findings,
      ...dependencyResult.findings,
      ...apiResult.findings
    ];

    // Save findings
    if (allFindings.length > 0) {
      await Finding.insertMany(allFindings);
    }

    // Calculate scores
    const scores = calculateScores({
      changeRiskScore: changeResult.changeRiskScore,
      testReadinessScore: changeResult.testReadinessScore,
      apiCompatibilityScore: apiResult.apiCompatibilityScore,
      dependencySafetyScore: dependencyResult.dependencySafetyScore,
      securityScore: securityResult.securityScore,
      verificationConfidence: 0,
      findings: allFindings
    });

    await sleep(400);

    await AnalysisRun.findByIdAndUpdate(analysisRunId, {
      'analysisProgress.calculatingScore': 'DONE',
      'analysisProgress.generatingReport': 'IN_PROGRESS'
    });

    const executiveSummary = generateDemoSummary(scores, allFindings);

    const updatedRun = await AnalysisRun.findByIdAndUpdate(analysisRunId, {
      status: 'AWAITING_FIX',
      releaseScore: scores.releaseScore,
      securityScore: scores.securityScore,
      verificationConfidence: 0,
      decision: scores.decision,
      scoreBreakdown: scores.scoreBreakdown,
      hardGates: scores.hardGates,
      executiveSummary,
      aiSummary: 'AI analysis: This PR introduces a critical hardcoded API secret, missing authorization on the refund endpoint, and command injection risk via exec(). The CI/CD workflow also exposes deployment secrets. The README contains potential AI context injection patterns.',
      changedFiles: DEMO_FILES.length,
      linesAdded: DEMO_FILES.reduce((s, f) => s + f.additions, 0),
      linesRemoved: DEMO_FILES.reduce((s, f) => s + f.deletions, 0),
      aiAvailable: false,
      'analysisProgress.generatingReport': 'DONE',
      completedAt: new Date()
    }, { new: true });

    // Generate fix pack
    if (updatedRun) {
      const savedFindings = await Finding.find({ analysisRunId });
      const fixPackContent = generateFixPack({
        analysis: updatedRun,
        repository: repo,
        pullRequest: pr,
        findings: savedFindings
      });

      await FixPack.create({
        analysisRunId,
        repositoryId,
        content: fixPackContent,
        version: 1,
        findingIds: savedFindings.map(f => f.id)
      });
    }

    logger.info(`Demo analysis ${analysisRunId} completed. Score: ${scores.releaseScore}, Decision: ${scores.decision}`);

  } catch (err) {
    logger.error('Demo analysis failed:', err instanceof Error ? err.message : String(err));
    await AnalysisRun.findByIdAndUpdate(analysisRunId, { status: 'FAILED', completedAt: new Date() });
  }
}

export async function runDemoVerification(
  newAnalysisRunId: string,
  previousAnalysisId: string,
  pullRequestId: string,
  repositoryId: string
): Promise<void> {
  logger.info(`Running demo verification ${newAnalysisRunId} (prev: ${previousAnalysisId})`);

  try {
    const pr = await PullRequest.findById(pullRequestId);
    const repo = await Repository.findById(repositoryId);
    if (!pr || !repo) throw new Error('PR or repo not found');

    await AnalysisRun.findByIdAndUpdate(newAnalysisRunId, {
      status: 'TRIAGED',
      'analysisProgress.fetchingPR': 'DONE'
    });

    await sleep(600);

    await AnalysisRun.findByIdAndUpdate(newAnalysisRunId, {
      status: 'REANALYZING',
      'analysisProgress.buildingContext': 'DONE',
      'analysisProgress.runningChecks': 'IN_PROGRESS'
    });

    // Run analyzers with fixed demo files
    const [changeResult, securityResult, dependencyResult, apiResult] = await Promise.all([
      analyzeChanges(DEMO_FIXED_FILES, newAnalysisRunId, repositoryId),
      analyzeSecurityRisks(DEMO_FIXED_FILES, newAnalysisRunId, repositoryId, new Map([
        ['src/controllers/paymentController.ts', `
import { Request, Response } from 'express';
import { PaymentService } from '../services/paymentService';
import { requireAdmin } from '../middleware/auth';

export const paymentController = {
  async refundPayment(req: Request, res: Response) {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const payment = await PaymentService.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Not found' });
    if (payment.refunded) return res.status(409).json({ error: 'Already refunded' });
    const refund = await PaymentService.processRefund(req.params.id, req.body.amount, req.body.reason);
    return res.json(refund);
  }
};`]
      ])),
      analyzeDependencies(DEMO_FIXED_FILES, newAnalysisRunId, repositoryId, new Map()),
      analyzeAPIChanges(DEMO_FIXED_FILES, newAnalysisRunId, repositoryId, new Map(), new Map())
    ]);

    await sleep(800);

    // Get previous findings
    const prevFindings = await Finding.find({ analysisRunId: previousAnalysisId });
    const newFindings = [
      ...changeResult.findings,
      ...securityResult.findings,
      ...dependencyResult.findings,
      ...apiResult.findings
    ];

    // Save new findings
    if (newFindings.length > 0) {
      await Finding.insertMany(newFindings);
    }

    // Calculate new scores
    const scores = calculateScores({
      changeRiskScore: changeResult.changeRiskScore,
      testReadinessScore: changeResult.testReadinessScore,
      apiCompatibilityScore: apiResult.apiCompatibilityScore,
      dependencySafetyScore: dependencyResult.dependencySafetyScore,
      securityScore: securityResult.securityScore,
      verificationConfidence: 82,
      findings: newFindings
    });

    await AnalysisRun.findByIdAndUpdate(newAnalysisRunId, {
      'analysisProgress.runningChecks': 'DONE',
      'analysisProgress.aiReasoning': 'IN_PROGRESS'
    });

    await sleep(900);

    // Mark resolved/unresolved findings
    const criticalPrevFindings = prevFindings.filter(f =>
      f.severity === 'CRITICAL' || f.severity === 'HIGH'
    );

    // In our demo, the fix resolves the critical issues
    const resolvedIds: string[] = [];
    const unresolvedIds: string[] = [];

    for (const finding of criticalPrevFindings) {
      if (finding.title.includes('secret') || finding.title.includes('Secret') ||
          finding.title.includes('exec') || finding.title.includes('injection') ||
          finding.title.includes('injection')) {
        resolvedIds.push(finding.id);
        await Finding.findByIdAndUpdate(finding.id, {
          status: 'RESOLVED',
          resolvedInAnalysisId: newAnalysisRunId
        });
      } else {
        unresolvedIds.push(finding.id);
      }
    }

    // Create verification run
    const prevRun = await AnalysisRun.findById(previousAnalysisId);
    const verRun = await VerificationRun.create({
      analysisRunId: newAnalysisRunId,
      previousAnalysisId,
      repositoryId,
      targetSha: pr.headSha,
      checks: [
        { name: 'Security Check', status: 'PASSED', details: 'No critical security issues detected' },
        { name: 'Static Analysis', status: 'PASSED', details: 'Code analysis passed' },
        { name: 'Dependency Audit', status: 'PASSED', details: 'No new vulnerable dependencies' },
        { name: 'Test Presence', status: 'PASSED', details: 'Test file added for refund controller' },
        { name: 'AI Verification', status: 'PASSED', details: 'AI confirms hardcoded secret removed, auth check added' }
      ],
      resolvedFindingIds: resolvedIds,
      unresolvedFindingIds: unresolvedIds,
      partiallyResolvedFindingIds: [],
      newFindingIds: [],
      regressions: [],
      result: unresolvedIds.length === 0 ? 'RESOLVED' : 'PARTIAL',
      scoreBefore: prevRun?.releaseScore || 0,
      scoreAfter: scores.releaseScore,
      securityScoreBefore: prevRun?.securityScore || 0,
      securityScoreAfter: scores.securityScore,
      aiVerificationSummary: 'Independent verification confirms the hardcoded API secret has been removed and authorization check has been added to the refund endpoint. The command injection via exec() is resolved. Test coverage has been added. Prompt injection pattern in README appears removed.'
    });

    const updatedRun = await AnalysisRun.findByIdAndUpdate(newAnalysisRunId, {
      status: 'RESOLVED',
      releaseScore: scores.releaseScore,
      securityScore: scores.securityScore,
      verificationConfidence: 82,
      decision: scores.decision,
      scoreBreakdown: scores.scoreBreakdown,
      hardGates: scores.hardGates,
      executiveSummary: `Re-analysis after fix: Release Score improved from ${prevRun?.releaseScore || 0} to ${scores.releaseScore}. Security Score improved from ${prevRun?.securityScore || 0} to ${scores.securityScore}. ${resolvedIds.length} finding(s) resolved. Decision: ${scores.decision.replace(/_/g, ' ')}.`,
      aiSummary: verRun.aiVerificationSummary,
      changedFiles: DEMO_FIXED_FILES.length,
      linesAdded: DEMO_FIXED_FILES.reduce((s, f) => s + f.additions, 0),
      linesRemoved: DEMO_FIXED_FILES.reduce((s, f) => s + f.deletions, 0),
      aiAvailable: false,
      'analysisProgress.aiReasoning': 'DONE',
      'analysisProgress.calculatingScore': 'DONE',
      'analysisProgress.generatingReport': 'DONE',
      completedAt: new Date()
    }, { new: true });

    if (updatedRun) {
      const savedFindings = await Finding.find({ analysisRunId: newAnalysisRunId });
      const fixPackContent = generateFixPack({
        analysis: updatedRun,
        repository: repo,
        pullRequest: pr,
        findings: savedFindings
      });

      if (savedFindings.length > 0 || newFindings.length === 0) {
        await FixPack.create({
          analysisRunId: newAnalysisRunId,
          repositoryId,
          content: savedFindings.length > 0 ? fixPackContent : '# Fix Pack\n\nNo remaining open findings. The change is ready for release.',
          version: 1,
          findingIds: savedFindings.map(f => f.id)
        });
      }
    }

    logger.info(`Demo verification ${newAnalysisRunId} completed. Score: ${scores.releaseScore}`);

  } catch (err) {
    logger.error('Demo verification failed:', err instanceof Error ? err.message : String(err));
    await AnalysisRun.findByIdAndUpdate(newAnalysisRunId, { status: 'FAILED', completedAt: new Date() });
  }
}

function generateDemoSummary(
  scores: ReturnType<typeof calculateScores>,
  findings: Partial<{ severity: string; title: string; category: string }>[]
): string {
  const criticalCount = findings.filter(f => f.severity === 'CRITICAL').length;
  const highCount = findings.filter(f => f.severity === 'HIGH').length;

  return `Veridara demo analysis completed. Release Score: ${scores.releaseScore}/100 (${scores.decision.replace(/_/g, ' ')}). Security Score: ${scores.securityScore}/100. ${criticalCount} critical and ${highCount} high-severity findings detected. The release is ${scores.hardGates.length > 0 ? 'BLOCKED due to critical security issues' : 'ready for review'}. Use the AI Fix Pack to address the identified issues.`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
