import { IFinding } from '../../models/Finding';
import { GitHubFile } from '../../github/githubService';

interface DependencyChange {
  name: string;
  from?: string;
  to?: string;
  type: 'ADDED' | 'REMOVED' | 'UPDATED' | 'DOWNGRADED';
}

interface DependencyAnalysisResult {
  findings: Partial<IFinding>[];
  dependencySafetyScore: number;
  changes: DependencyChange[];
}

// Known highly suspicious package patterns
const SUSPICIOUS_PACKAGE_PATTERNS = [
  /^[a-z]+-[a-z]+-[a-z]+$/,  // Typosquatting pattern: legitimate-package-extra
];

const VERY_SUSPICIOUS_NAMES = [
  'colors', 'faker', 'event-stream', // Historical supply chain attacks
];

function parsePackageJson(content: string): Record<string, Record<string, string>> {
  try {
    const pkg = JSON.parse(content);
    return {
      dependencies: pkg.dependencies || {},
      devDependencies: pkg.devDependencies || {},
      peerDependencies: pkg.peerDependencies || {}
    };
  } catch {
    return {};
  }
}

function compareVersions(from: string, to: string): 'MAJOR' | 'MINOR' | 'PATCH' | 'UNKNOWN' {
  const clean = (v: string) => v.replace(/^[\^~>=<]/, '');
  const parseV = (v: string) => clean(v).split('.').map(Number);

  try {
    const [fMaj, fMin] = parseV(from);
    const [tMaj, tMin] = parseV(to);

    if (tMaj > fMaj) return 'MAJOR';
    if (tMin > fMin) return 'MINOR';
    return 'PATCH';
  } catch {
    return 'UNKNOWN';
  }
}

export async function analyzeDependencies(
  files: GitHubFile[],
  analysisRunId: string,
  repositoryId: string,
  fileContents: Map<string, string>
): Promise<DependencyAnalysisResult> {
  const findings: Partial<IFinding>[] = [];
  const changes: DependencyChange[] = [];

  const pkgFile = files.find(f => f.filename === 'package.json');
  if (!pkgFile) {
    return { findings, dependencySafetyScore: 100, changes };
  }

  const newContent = fileContents.get('package.json');
  if (!newContent) {
    return { findings, dependencySafetyScore: 100, changes };
  }

  const newDeps = parsePackageJson(newContent);
  const allNewDeps = { ...newDeps.dependencies, ...newDeps.devDependencies };

  // Parse the diff to find added/removed lines in package.json
  const patch = pkgFile.patch || '';
  const addedLines = patch.split('\n').filter(l => l.startsWith('+')).map(l => l.substring(1));
  const removedLines = patch.split('\n').filter(l => l.startsWith('-')).map(l => l.substring(1));

  // Extract dependency changes from diff
  const depPattern = /"([^"]+)":\s*"([^"]+)"/g;

  const getDepFromLine = (line: string): { name: string; version: string } | null => {
    depPattern.lastIndex = 0;
    const match = depPattern.exec(line);
    if (match) return { name: match[1], version: match[2] };
    return null;
  };

  const addedDeps = addedLines.map(getDepFromLine).filter(Boolean) as { name: string; version: string }[];
  const removedDeps = removedLines.map(getDepFromLine).filter(Boolean) as { name: string; version: string }[];

  // Build change list
  for (const added of addedDeps) {
    const removed = removedDeps.find(r => r.name === added.name);

    if (removed) {
      const jumpType = compareVersions(removed.version, added.version);
      changes.push({
        name: added.name,
        from: removed.version,
        to: added.version,
        type: jumpType === 'MAJOR' ? 'UPDATED' : 'UPDATED'
      });

      if (jumpType === 'MAJOR') {
        findings.push({
          analysisRunId,
          repositoryId,
          category: 'DEPENDENCY',
          severity: 'MEDIUM',
          confidence: 0.88,
          title: `Major version bump: ${added.name} ${removed.version} → ${added.version}`,
          summary: `The package ${added.name} was updated across a major version boundary, which may include breaking changes.`,
          evidence: [{
            file: 'package.json',
            description: `${added.name}: ${removed.version} → ${added.version} (major version bump)`
          }],
          affectedFiles: ['package.json'],
          impact: 'Major version bumps may contain breaking API changes that could cause runtime errors.',
          recommendation: `Review the ${added.name} changelog for breaking changes. Test all code paths that use this package.`,
          suggestedTests: ['Run full test suite after upgrade', 'Check for deprecation warnings'],
          verificationCriteria: ['All tests pass', 'No breaking changes introduced'],
          detectionMethod: 'STATIC_ANALYSIS',
          status: 'OPEN'
        });
      }
    } else {
      // New dependency added
      changes.push({
        name: added.name,
        to: added.version,
        type: 'ADDED'
      });

      findings.push({
        analysisRunId,
        repositoryId,
        category: 'DEPENDENCY',
        severity: 'LOW',
        confidence: 0.80,
        title: `New dependency added: ${added.name}`,
        summary: `The package ${added.name}@${added.version} was added as a new dependency.`,
        evidence: [{
          file: 'package.json',
          description: `New dependency: ${added.name}@${added.version}`
        }],
        affectedFiles: ['package.json'],
        impact: 'New dependencies increase the attack surface and bundle size.',
        recommendation: `Verify ${added.name} is necessary. Check its license, maintenance status, and known vulnerabilities.`,
        suggestedTests: ['Review package on npm for security advisories', 'Run npm audit'],
        verificationCriteria: ['Package necessity justified', 'No known vulnerabilities'],
        detectionMethod: 'STATIC_ANALYSIS',
        status: 'OPEN'
      });
    }
  }

  // Removed dependencies
  for (const removed of removedDeps) {
    const stillThere = addedDeps.find(a => a.name === removed.name);
    if (!stillThere) {
      changes.push({ name: removed.name, from: removed.version, type: 'REMOVED' });
    }
  }

  // Check lockfile consistency
  const lockfileChanged = files.some(f => f.filename === 'package-lock.json' || f.filename === 'yarn.lock');
  const pkgChanged = !!pkgFile;

  if (pkgChanged && !lockfileChanged && changes.length > 0) {
    findings.push({
      analysisRunId,
      repositoryId,
      category: 'DEPENDENCY',
      severity: 'MEDIUM',
      confidence: 0.85,
      title: 'package.json changed without lockfile update',
      summary: 'Dependencies were modified in package.json but the lockfile (package-lock.json/yarn.lock) was not updated.',
      evidence: [{
        file: 'package.json',
        description: 'package.json modified without corresponding lockfile change'
      }],
      affectedFiles: ['package.json'],
      impact: 'Inconsistent lockfiles can lead to different dependency versions across environments, causing non-deterministic builds.',
      recommendation: 'Run npm install or yarn install to regenerate the lockfile, then commit the updated lockfile.',
      suggestedTests: ['Verify build works with fresh npm install'],
      verificationCriteria: ['Lockfile updated and committed'],
      detectionMethod: 'STATIC_ANALYSIS',
      status: 'OPEN'
    });
  }

  // Calculate dependency safety score
  let dependencySafetyScore = 100;
  dependencySafetyScore -= changes.filter(c => c.type === 'ADDED').length * 5;
  dependencySafetyScore -= changes.filter(c => c.type === 'UPDATED').length * 3;
  if (!lockfileChanged && pkgChanged && changes.length > 0) dependencySafetyScore -= 10;

  dependencySafetyScore = Math.max(0, Math.min(100, dependencySafetyScore));

  return { findings, dependencySafetyScore, changes };
}
