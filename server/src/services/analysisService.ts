import { AnalysisRun, IAnalysisRun } from '../models/AnalysisRun';
import { Finding } from '../models/Finding';
import { FixPack } from '../models/FixPack';
import { Repository } from '../models/Repository';
import { PullRequest } from '../models/PullRequest';
import { User } from '../models/User';
import { analyzeChanges } from '../analyzers/change/changeAnalyzer';
import { analyzeSecurityRisks } from '../analyzers/security/securityAnalyzer';
import { analyzeDependencies } from '../analyzers/dependency/dependencyAnalyzer';
import { analyzeAPIChanges } from '../analyzers/api/apiAnalyzer';
import { runAIAnalysis } from '../analyzers/ai/aiAnalyzer';
import { calculateScores } from '../scoring/scoringEngine';
import { generateFixPack } from '../reports/fixPackGenerator';
import { getPRFiles, getFileContent, getOctokitForRepository } from '../github/githubService';
import { logger } from '../utils/logger';
import { transitionAnalysisRun, updateAnalysisRun } from './loopController';

export async function runAnalysis(analysisRunId: string): Promise<void> {
  const analysisRun = await AnalysisRun.findById(analysisRunId);
  if (!analysisRun) throw new Error(`Analysis run ${analysisRunId} not found`);

  const pullRequest = await PullRequest.findById(analysisRun.pullRequestId);
  if (!pullRequest) throw new Error('Pull request not found');

  const repository = await Repository.findById(analysisRun.repositoryId);
  if (!repository) throw new Error('Repository not found');

  const user = await User.findOne({ _id: repository.userId }).select('+githubAccessToken');
  const octokit = await getOctokitForRepository(repository.installationId, user?.githubAccessToken);
  const { owner, name } = repository;

  logger.info(`Starting analysis ${analysisRunId} for ${owner}/${name} PR#${pullRequest.githubPrNumber}`);

  try {
    // Update status
    await updateProgress(analysisRun, 'TRIAGED', 'fetchingPR', 'IN_PROGRESS');

    // Step 1: Fetch PR files
    const files = await getPRFiles(octokit, owner, name, pullRequest.githubPrNumber);

    await updateProgress(analysisRun, 'CONTEXT_BUILT', 'fetchingPR', 'DONE');
    await updateProgress(analysisRun, 'CONTEXT_BUILT', 'buildingContext', 'IN_PROGRESS');

    // Step 2: Fetch file contents (head SHA)
    const fileContents = new Map<string, string>();
    const baseContents = new Map<string, string>();

    // Fetch relevant files (not binaries, not too large)
    const textFiles = files.filter(f =>
      !f.filename.match(/\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|mp4|mp3|zip|tar|gz|bin|lock)$/) &&
      f.filename !== 'package-lock.json' // Skip lockfile contents (too large)
    );

    for (const file of textFiles.slice(0, 30)) {
      if (file.status !== 'removed') {
        const content = await getFileContent(octokit, owner, name, file.filename, pullRequest.headSha);
        if (content) fileContents.set(file.filename, content);
      }

      if (file.status !== 'added') {
        const baseContent = await getFileContent(octokit, owner, name, file.filename, pullRequest.baseSha);
        if (baseContent) baseContents.set(file.filename, baseContent);
      }
    }

    await updateProgress(analysisRun, 'ANALYZING', 'buildingContext', 'DONE');
    await updateProgress(analysisRun, 'ANALYZING', 'runningChecks', 'IN_PROGRESS');

    // Step 3: Run deterministic analyzers
    const [changeResult, securityResult, dependencyResult, apiResult] = await Promise.allSettled([
      analyzeChanges(files, analysisRunId, repository.id),
      analyzeSecurityRisks(files, analysisRunId, repository.id, fileContents),
      analyzeDependencies(files, analysisRunId, repository.id, fileContents),
      analyzeAPIChanges(files, analysisRunId, repository.id, fileContents, baseContents)
    ]);

    const unavailable = (name: string, reason: unknown): Partial<import('../models/Finding').IFinding> => ({
      analysisRunId,
      repositoryId: repository.id,
      category: 'INFRASTRUCTURE',
      severity: 'HIGH',
      confidence: 1,
      title: `${name} analyzer unavailable`,
      summary: `This check did not complete and must not be interpreted as a pass: ${reason instanceof Error ? reason.message : String(reason)}`,
      evidence: [{ file: 'veridara', description: `${name} analyzer failure` }],
      affectedFiles: [],
      impact: 'Release safety cannot be established while this analyzer is unavailable.',
      recommendation: 'Restore the analyzer and re-run the analysis.',
      suggestedTests: [],
      verificationCriteria: [`${name} analyzer completes successfully`],
      detectionMethod: 'HEURISTIC',
      status: 'OPEN'
    });
    const failures: Partial<import('../models/Finding').IFinding>[] = [];
    const changeAnalysis = changeResult.status === 'fulfilled' ? changeResult.value : (failures.push(unavailable('Change', changeResult.reason)), { findings: [], changeRiskScore: 0, testReadinessScore: 0, stats: { totalFiles: files.length, linesAdded: 0, linesRemoved: 0, sourceToTestRatio: 0 } });
    const securityAnalysis = securityResult.status === 'fulfilled' ? securityResult.value : (failures.push(unavailable('Security', securityResult.reason)), { findings: [], securityScore: 0, contextWarnings: ['Security analysis unavailable'], secretsDetected: false, promptInjectionDetected: false, sensitiveFilesDetected: false });
    const dependencyAnalysis = dependencyResult.status === 'fulfilled' ? dependencyResult.value : (failures.push(unavailable('Dependency', dependencyResult.reason)), { findings: [], dependencySafetyScore: 0, changes: [] });
    const apiAnalysis = apiResult.status === 'fulfilled' ? apiResult.value : (failures.push(unavailable('API compatibility', apiResult.reason)), { findings: [], apiCompatibilityScore: 0, breakingChanges: [] });

    await updateProgress(analysisRun, 'ANALYZING', 'runningChecks', 'DONE');
    await updateProgress(analysisRun, 'ANALYZING', 'aiReasoning', 'IN_PROGRESS');

    // Combine all deterministic findings
    const allDeterministicFindings = [
      ...changeAnalysis.findings,
      ...dependencyAnalysis.findings,
      ...apiAnalysis.findings,
      ...failures
    ];

    // Step 4: Run AI analysis
    const aiResult = await runAIAnalysis(
      {
        repository: {
          owner: repository.owner,
          name: repository.name,
          language: repository.language,
          framework: repository.framework
        },
        pullRequest: {
          number: pullRequest.githubPrNumber,
          title: pullRequest.title,
          baseSha: pullRequest.baseSha,
          headSha: pullRequest.headSha
        },
        changedFiles: files.map(f => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions
        })),
        diffs: files.map(f => ({ filename: f.filename, patch: f.patch || '' })),
        deterministicFindings: allDeterministicFindings.map(f => ({
          category: String(f.category || ''),
          severity: String(f.severity || ''),
          title: String(f.title || ''),
          summary: String(f.summary || '')
        })),
        securityFindings: securityAnalysis.findings.map(f => ({
          category: String(f.category || ''),
          severity: String(f.severity || ''),
          title: String(f.title || ''),
          summary: String(f.summary || '')
        })),
        contextWarnings: securityAnalysis.contextWarnings
      },
      fileContents,
      analysisRunId,
      repository.id
    );

    await updateProgress(analysisRun, 'ANALYZING', 'aiReasoning', 'DONE');
    await updateProgress(analysisRun, 'FINDINGS_READY', 'calculatingScore', 'IN_PROGRESS');

    // Step 5: Persist all findings
    const allFindings = [
      ...allDeterministicFindings,
      ...securityAnalysis.findings,
      ...(aiResult.findings || [])
    ];

    if (allFindings.length > 0) {
      await Finding.insertMany(allFindings);
    }

    // Step 6: Calculate scores
    const scores = calculateScores({
      changeRiskScore: changeAnalysis.changeRiskScore || 50,
      testReadinessScore: changeAnalysis.testReadinessScore || 50,
      apiCompatibilityScore: apiAnalysis.apiCompatibilityScore,
      dependencySafetyScore: dependencyAnalysis.dependencySafetyScore,
      securityScore: securityAnalysis.securityScore,
      verificationConfidence: 0, // Not verified yet
      findings: allFindings
    });

    await updateProgress(analysisRun, 'FINDINGS_READY', 'calculatingScore', 'DONE');
    await updateProgress(analysisRun, 'FIX_PLAN_READY', 'generatingReport', 'IN_PROGRESS');

    // Step 7: Update analysis run with results
    const updatedRun = await transitionAnalysisRun(analysisRunId, 'FIX_PLAN_READY', {
      releaseScore: scores.releaseScore,
      securityScore: scores.securityScore,
      verificationConfidence: 0,
      decision: scores.decision,
      scoreBreakdown: scores.scoreBreakdown,
      hardGates: scores.hardGates,
      aiSummary: aiResult.summary,
      executiveSummary: generateExecutiveSummary(scores, allFindings, aiResult.summary),
      changedFiles: files.length,
      linesAdded: files.reduce((s, f) => s + f.additions, 0),
      linesRemoved: files.reduce((s, f) => s + f.deletions, 0),
      aiAvailable: aiResult.available,
      'analysisProgress.generatingReport': 'IN_PROGRESS',
      completedAt: new Date()
    });

    // Step 8: Generate and persist Fix Pack
    if (updatedRun) {
      const savedFindings = await Finding.find({ analysisRunId });

      const fixPackContent = generateFixPack({
        analysis: updatedRun,
        repository,
        pullRequest,
        findings: savedFindings
      });

      await FixPack.create({
        analysisRunId,
        repositoryId: repository.id,
        content: fixPackContent,
        version: 1,
        findingIds: savedFindings.map(f => f.id)
      });
    }

    await transitionAnalysisRun(analysisRunId, failures.length ? 'PARTIAL' : 'AWAITING_FIX', {
      'analysisProgress.generatingReport': 'DONE'
    });

    logger.info(`Analysis ${analysisRunId} completed. Score: ${scores.releaseScore}, Decision: ${scores.decision}`);

  } catch (err) {
    logger.error(`Analysis ${analysisRunId} failed:`, err instanceof Error ? err.message : String(err));
    const current = await AnalysisRun.findById(analysisRunId).select('status');
    if (current && canFail(current.status)) await transitionAnalysisRun(analysisRunId, 'FAILED', { completedAt: new Date() });
    throw err;
  }
}

async function updateProgress(
  run: IAnalysisRun,
  status: import('../models/AnalysisRun').AnalysisStatus,
  step: string,
  stepStatus: string
): Promise<void> {
  const patch = { [`analysisProgress.${step}`]: stepStatus };
  const current = await AnalysisRun.findById(run._id).select('status');
  if (!current) throw new Error(`Analysis run ${run.id} not found`);
  if (current.status === status) await updateAnalysisRun(run.id, patch);
  else await transitionAnalysisRun(run.id, status, patch);
}

function canFail(status: import('../models/AnalysisRun').AnalysisStatus): boolean {
  return !['RESOLVED', 'PARTIAL', 'REGRESSED', 'UNRESOLVED', 'COMPLETED', 'FAILED', 'PARTIALLY_COMPLETED'].includes(status);
}

function generateExecutiveSummary(
  scores: ReturnType<typeof calculateScores>,
  findings: Partial<{ category: string; severity: string; title: string }>[], 
  aiSummary?: string
): string {
  const criticalCount = findings.filter(f => f.severity === 'CRITICAL').length;
  const highCount = findings.filter(f => f.severity === 'HIGH').length;
  const mediumCount = findings.filter(f => f.severity === 'MEDIUM').length;

  let summary = `Veridara analysis completed. `;
  summary += `Release Score: ${scores.releaseScore}/100 (${scores.decision.replace(/_/g, ' ')}). `;
  summary += `Security Score: ${scores.securityScore}/100. `;

  if (criticalCount > 0) summary += `⚠️ ${criticalCount} critical finding(s) require immediate attention. `;
  if (highCount > 0) summary += `${highCount} high-severity finding(s) detected. `;
  if (mediumCount > 0) summary += `${mediumCount} medium-severity finding(s) noted. `;
  if (criticalCount === 0 && highCount === 0) summary += 'No critical or high-severity issues detected. ';

  if (scores.hardGates.length > 0) {
    summary += `Release is BLOCKED: ${scores.hardGates[0]}. `;
  }

  if (aiSummary) {
    summary += `\n\n**AI Analysis:** ${aiSummary}`;
  }

  return summary;
}
