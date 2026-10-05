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

    const changeAnalysis = changeResult.status === 'fulfilled' ? changeResult.value : { findings: [], changeRiskScore: 50, testReadinessScore: 50, stats: { totalFiles: files.length, linesAdded: 0, linesRemoved: 0, sourceToTestRatio: 0 } };
    const securityAnalysis = securityResult.status === 'fulfilled' ? securityResult.value : { findings: [], securityScore: 100, contextWarnings: [], secretsDetected: false, promptInjectionDetected: false, sensitiveFilesDetected: false };
    const dependencyAnalysis = dependencyResult.status === 'fulfilled' ? dependencyResult.value : { findings: [], dependencySafetyScore: 100, changes: [] };
    const apiAnalysis = apiResult.status === 'fulfilled' ? apiResult.value : { findings: [], apiCompatibilityScore: 100, breakingChanges: [] };

    await updateProgress(analysisRun, 'ANALYZING', 'runningChecks', 'DONE');
    await updateProgress(analysisRun, 'ANALYZING', 'aiReasoning', 'IN_PROGRESS');

    // Combine all deterministic findings
    const allDeterministicFindings = [
      ...changeAnalysis.findings,
      ...dependencyAnalysis.findings,
      ...apiAnalysis.findings
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
      apiCompatibilityScore: apiAnalysis.apiCompatibilityScore || 100,
      dependencySafetyScore: dependencyAnalysis.dependencySafetyScore || 100,
      securityScore: securityAnalysis.securityScore || 100,
      verificationConfidence: 0, // Not verified yet
      findings: allFindings
    });

    await updateProgress(analysisRun, 'FINDINGS_READY', 'calculatingScore', 'DONE');
    await updateProgress(analysisRun, 'FIX_PLAN_READY', 'generatingReport', 'IN_PROGRESS');

    // Step 7: Update analysis run with results
    const updatedRun = await AnalysisRun.findByIdAndUpdate(analysisRunId, {
      status: 'FIX_PLAN_READY',
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
    }, { new: true });

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

    await AnalysisRun.findByIdAndUpdate(analysisRunId, {
      status: 'AWAITING_FIX',
      'analysisProgress.generatingReport': 'DONE'
    });

    logger.info(`Analysis ${analysisRunId} completed. Score: ${scores.releaseScore}, Decision: ${scores.decision}`);

  } catch (err) {
    logger.error(`Analysis ${analysisRunId} failed:`, err instanceof Error ? err.message : String(err));
    await AnalysisRun.findByIdAndUpdate(analysisRunId, {
      status: 'FAILED',
      completedAt: new Date()
    });
    throw err;
  }
}

async function updateProgress(
  run: IAnalysisRun,
  status: string,
  step: string,
  stepStatus: string
): Promise<void> {
  await AnalysisRun.findByIdAndUpdate(run._id, {
    status,
    [`analysisProgress.${step}`]: stepStatus
  });
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
