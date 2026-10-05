import { IFinding } from '../../models/Finding';
import { GitHubFile } from '../../github/githubService';
import { v4 as uuidv4 } from 'uuid';

const HIGH_RISK_PATHS = [
  'auth/', 'security/', 'payments/', 'billing/', 'database/', 'middleware/',
  'config/', '.github/workflows/', 'Dockerfile', 'docker-compose',
  'package.json', 'package-lock.json', 'yarn.lock', '.env'
];

const TEST_FILE_PATTERNS = [
  /\.test\.[jt]s$/,
  /\.spec\.[jt]s$/,
  /\/__tests__\//,
  /\/test\//,
  /\/tests\//,
  /\.test\.tsx$/,
  /\.spec\.tsx$/
];

const SOURCE_FILE_PATTERNS = [
  /\.[jt]sx?$/,
  /\.py$/,
  /\.go$/,
  /\.java$/,
  /\.rs$/
];

interface ChangeAnalysisResult {
  findings: Partial<IFinding>[];
  changeRiskScore: number;
  testReadinessScore: number;
  changedFiles: GitHubFile[];
  sourceFiles: string[];
  testFiles: string[];
  highRiskFiles: string[];
  stats: {
    totalFiles: number;
    linesAdded: number;
    linesRemoved: number;
    sourceToTestRatio: number;
  };
}

export async function analyzeChanges(
  files: GitHubFile[],
  analysisRunId: string,
  repositoryId: string
): Promise<ChangeAnalysisResult> {
  const findings: Partial<IFinding>[] = [];

  const sourceFiles = files.filter(f => SOURCE_FILE_PATTERNS.some(p => p.test(f.filename)) && !TEST_FILE_PATTERNS.some(t => t.test(f.filename)));
  const testFiles = files.filter(f => TEST_FILE_PATTERNS.some(p => p.test(f.filename)));
  const highRiskFiles = files.filter(f => HIGH_RISK_PATHS.some(p => f.filename.includes(p)));
  const configFiles = files.filter(f => f.filename.match(/\.(json|yaml|yml|env|toml|ini)$/));

  const linesAdded = files.reduce((s, f) => s + f.additions, 0);
  const linesRemoved = files.reduce((s, f) => s + f.deletions, 0);
  const totalLines = linesAdded + linesRemoved;

  // Test coverage ratio
  const sourceToTestRatio = sourceFiles.length > 0
    ? testFiles.length / sourceFiles.length
    : 1;

  // Finding: source changed but no tests
  if (sourceFiles.length > 0 && testFiles.length === 0) {
    findings.push({
      analysisRunId,
      repositoryId,
      category: 'TESTING',
      severity: 'MEDIUM',
      confidence: 0.85,
      title: 'Source code changed without corresponding test changes',
      summary: `${sourceFiles.length} source file(s) were modified but no test files were added or changed.`,
      evidence: sourceFiles.slice(0, 5).map(f => ({
        file: f.filename,
        description: `Source file changed: ${f.additions} additions, ${f.deletions} deletions`
      })),
      affectedFiles: sourceFiles.map(f => f.filename),
      impact: 'Changes may introduce regressions that would not be caught by automated testing.',
      recommendation: 'Add or update tests to cover the changed code paths.',
      suggestedTests: [
        'Add unit tests for modified functions',
        'Add integration tests for affected API endpoints',
        'Run existing test suite to verify no regressions'
      ],
      verificationCriteria: ['Test files exist for all modified source modules'],
      detectionMethod: 'STATIC_ANALYSIS',
      status: 'OPEN'
    });
  }

  // Finding: high-risk files changed
  if (highRiskFiles.length > 0) {
    const criticalPaths = highRiskFiles.filter(f =>
      f.filename.includes('auth/') ||
      f.filename.includes('security/') ||
      f.filename.includes('payments/') ||
      f.filename.includes('billing/')
    );

    if (criticalPaths.length > 0) {
      findings.push({
        analysisRunId,
        repositoryId,
        category: 'SECURITY',
        severity: 'HIGH',
        confidence: 0.80,
        title: 'Changes to high-risk security-sensitive files',
        summary: `${criticalPaths.length} file(s) in security-sensitive paths were modified.`,
        evidence: criticalPaths.map(f => ({
          file: f.filename,
          description: `High-risk path modified: ${f.additions} additions, ${f.deletions} deletions`
        })),
        affectedFiles: criticalPaths.map(f => f.filename),
        impact: 'Changes to authentication, payments, or security code carry elevated risk of introducing vulnerabilities.',
        recommendation: 'Perform thorough security review of changes in auth/payment/security modules. Ensure all security tests pass.',
        suggestedTests: [
          'Run authentication test suite',
          'Verify authorization still works correctly',
          'Test boundary conditions in changed security code'
        ],
        verificationCriteria: ['Security-sensitive tests pass', 'No new security findings introduced'],
        detectionMethod: 'STATIC_ANALYSIS',
        status: 'OPEN'
      });
    }
  }

  // Finding: large change with many files
  if (files.length > 20) {
    findings.push({
      analysisRunId,
      repositoryId,
      category: 'CORRECTNESS',
      severity: 'MEDIUM',
      confidence: 0.70,
      title: 'Large change scope increases regression risk',
      summary: `This PR modifies ${files.length} files with ${totalLines} lines changed. Large changes are harder to review and more likely to introduce regressions.`,
      evidence: [{
        file: 'PR Overview',
        description: `${files.length} files changed, ${linesAdded} additions, ${linesRemoved} deletions`
      }],
      affectedFiles: [],
      impact: 'Large changes may have unforeseen interactions between modified components.',
      recommendation: 'Consider breaking this PR into smaller, focused changes. Ensure comprehensive test coverage.',
      suggestedTests: ['Full integration test suite', 'Regression test against known scenarios'],
      verificationCriteria: ['All tests pass', 'No unexpected behavior introduced'],
      detectionMethod: 'HEURISTIC',
      status: 'OPEN'
    });
  }

  // Finding: CI/CD workflow changed
  const ciFiles = files.filter(f => f.filename.includes('.github/workflows/'));
  if (ciFiles.length > 0) {
    findings.push({
      analysisRunId,
      repositoryId,
      category: 'INFRASTRUCTURE',
      severity: 'HIGH',
      confidence: 0.88,
      title: 'CI/CD workflow configuration changed',
      summary: `${ciFiles.length} GitHub Actions workflow file(s) were modified. Workflow changes can affect deployment pipeline security.`,
      evidence: ciFiles.map(f => ({
        file: f.filename,
        description: `CI/CD configuration modified: ${f.additions} additions, ${f.deletions} deletions`
      })),
      affectedFiles: ciFiles.map(f => f.filename),
      impact: 'Malicious or misconfigured CI/CD workflows can expose secrets, execute arbitrary commands, or compromise the build pipeline.',
      recommendation: 'Review all changes to workflow files carefully. Ensure no secrets are exposed and no untrusted actions are added.',
      suggestedTests: [
        'Verify workflow permissions are appropriately scoped',
        'Check that external actions are pinned to specific SHAs',
        'Ensure secrets are not echoed in logs'
      ],
      verificationCriteria: ['Workflow changes reviewed and approved', 'No secret exposure in workflow'],
      detectionMethod: 'STATIC_ANALYSIS',
      status: 'OPEN'
    });
  }

  // Calculate change risk score (lower is more risky)
  let changeRiskScore = 100;

  // Penalize for high-risk files
  changeRiskScore -= highRiskFiles.length * 5;

  // Penalize for large changes
  if (files.length > 20) changeRiskScore -= 15;
  else if (files.length > 10) changeRiskScore -= 8;

  // Penalize for CI changes
  if (ciFiles.length > 0) changeRiskScore -= 15;

  changeRiskScore = Math.max(0, Math.min(100, changeRiskScore));

  // Calculate test readiness score
  let testReadinessScore = 100;

  if (sourceFiles.length > 0 && testFiles.length === 0) {
    testReadinessScore -= 40;
  } else if (sourceToTestRatio < 0.5) {
    testReadinessScore -= 20;
  }

  testReadinessScore = Math.max(0, Math.min(100, testReadinessScore));

  return {
    findings,
    changeRiskScore,
    testReadinessScore,
    changedFiles: files,
    sourceFiles: sourceFiles.map(f => f.filename),
    testFiles: testFiles.map(f => f.filename),
    highRiskFiles: highRiskFiles.map(f => f.filename),
    stats: {
      totalFiles: files.length,
      linesAdded,
      linesRemoved,
      sourceToTestRatio
    }
  };
}
