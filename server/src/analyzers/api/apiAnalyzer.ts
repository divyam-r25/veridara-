import { IFinding } from '../../models/Finding';
import { GitHubFile } from '../../github/githubService';

interface APIAnalysisResult {
  findings: Partial<IFinding>[];
  apiCompatibilityScore: number;
  breakingChanges: string[];
}

// Detect route definition patterns
const ROUTE_PATTERNS = [
  /(?:app|router)\.(get|post|put|patch|delete)\s*\(['"`]([^'"`]+)/g,
  /(?:app|router)\.route\s*\(['"`]([^'"`]+)/g,
  /path:\s*['"`]([^'"`]+)/g,
  /@(?:Get|Post|Put|Patch|Delete)\s*\(['"`]([^'"`]+)/g,
];

// Detect required parameter patterns
const PARAM_PATTERN = /(?:req\.params\.|params\.)(\w+)|:(\w+)/g;
const BODY_REQUIRED_PATTERN = /const\s*\{([^}]+)\}\s*=\s*req\.body/g;

function extractRoutes(content: string): string[] {
  const routes: string[] = [];

  for (const pattern of ROUTE_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      routes.push(match[2] || match[1]);
    }
  }

  return [...new Set(routes)];
}

export async function analyzeAPIChanges(
  files: GitHubFile[],
  analysisRunId: string,
  repositoryId: string,
  fileContents: Map<string, string>,
  baseContents: Map<string, string>
): Promise<APIAnalysisResult> {
  const findings: Partial<IFinding>[] = [];
  const breakingChanges: string[] = [];

  const apiFiles = files.filter(f =>
    f.filename.match(/routes?\/|controllers?\/|handlers?\/|endpoints?\//) &&
    f.filename.match(/\.[jt]sx?$/)
  );

  const openApiFiles = files.filter(f =>
    f.filename.match(/openapi|swagger/i) && f.filename.match(/\.(json|yaml|yml)$/)
  );

  // Analyze route files
  for (const file of apiFiles) {
    const newContent = fileContents.get(file.filename);
    const oldContent = baseContents.get(file.filename);

    if (!newContent) continue;

    const newRoutes = extractRoutes(newContent);
    const oldRoutes = oldContent ? extractRoutes(oldContent) : [];

    // Detect removed routes
    const removedRoutes = oldRoutes.filter(r => !newRoutes.includes(r));
    for (const route of removedRoutes) {
      breakingChanges.push(`Route removed: ${route}`);
      findings.push({
        analysisRunId,
        repositoryId,
        category: 'API',
        severity: 'HIGH',
        confidence: 0.82,
        title: `Potential breaking change: route removed (${route})`,
        summary: `The API route "${route}" appears to have been removed from ${file.filename}. Clients depending on this endpoint will receive errors.`,
        evidence: [{
          file: file.filename,
          description: `Route "${route}" existed in base branch but not in head branch`
        }],
        affectedFiles: [file.filename],
        impact: 'Removing API endpoints is a breaking change that will cause failures for all clients that depend on this route.',
        recommendation: `If this route was intentionally removed, ensure all clients are updated. Consider deprecating the route first and maintaining backward compatibility.`,
        suggestedTests: [
          `Test that ${route} returns appropriate response`,
          'Check no existing clients rely on this endpoint'
        ],
        verificationCriteria: ['All dependent clients updated', 'No 404 errors for previous clients'],
        detectionMethod: 'STATIC_ANALYSIS',
        status: 'OPEN'
      });
    }
  }

  // Analyze OpenAPI spec changes
  for (const file of openApiFiles) {
    if (file.status === 'modified') {
      findings.push({
        analysisRunId,
        repositoryId,
        category: 'API',
        severity: 'MEDIUM',
        confidence: 0.85,
        title: `OpenAPI/Swagger specification modified`,
        summary: `The API specification file ${file.filename} was modified. Review for breaking changes.`,
        evidence: [{
          file: file.filename,
          description: `API specification: ${file.additions} additions, ${file.deletions} deletions`
        }],
        affectedFiles: [file.filename],
        impact: 'API specification changes may indicate breaking changes that affect API consumers.',
        recommendation: 'Review the specification diff to identify breaking changes. Ensure backward compatibility or communicate changes to API consumers.',
        suggestedTests: ['Run API contract tests', 'Validate against previous API version'],
        verificationCriteria: ['API contract validated', 'No unintended breaking changes'],
        detectionMethod: 'STATIC_ANALYSIS',
        status: 'OPEN'
      });
    }
  }

  // API compatibility score
  let apiCompatibilityScore = 100;
  apiCompatibilityScore -= breakingChanges.length * 20;
  apiCompatibilityScore -= openApiFiles.filter(f => f.status === 'modified').length * 10;
  apiCompatibilityScore = Math.max(0, Math.min(100, apiCompatibilityScore));

  return { findings, apiCompatibilityScore, breakingChanges };
}
