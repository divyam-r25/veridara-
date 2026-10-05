import { IFinding } from '../../models/Finding';
import { GitHubFile } from '../../github/githubService';

// Secret patterns - detect likely credentials but never store/log them
const SECRET_PATTERNS = [
  { pattern: /(?:api[_-]?key|apikey)\s*[=:]\s*['"]?([A-Za-z0-9_\-]{20,})/gi, type: 'API Key' },
  { pattern: /(?:secret|token)\s*[=:]\s*['"]?([A-Za-z0-9_\-]{20,})/gi, type: 'Secret/Token' },
  { pattern: /(?:password|passwd|pwd)\s*[=:]\s*['"]?([^\s'"]{8,})/gi, type: 'Password' },
  { pattern: /AKIA[0-9A-Z]{16}/g, type: 'AWS Access Key' },
  { pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@/gi, type: 'Database Connection String' },
  { pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g, type: 'Private Key' },
  { pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, type: 'JWT Token' },
  { pattern: /ghp_[A-Za-z0-9]{36}/g, type: 'GitHub Personal Access Token' },
  { pattern: /sk-[A-Za-z0-9]{48}/g, type: 'OpenAI API Key' },
  { pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/g, type: 'Slack Token' },
];

// Prompt injection patterns
const PROMPT_INJECTION_PATTERNS = [
  {
    pattern: /ignore (?:previous|above|all) instructions?/gi,
    risk: 'HIGH',
    reason: 'Attempts to override AI system instructions'
  },
  {
    pattern: /you are now|forget everything|disregard all previous/gi,
    risk: 'HIGH',
    reason: 'Attempts to reassign AI role or clear context'
  },
  {
    pattern: /reveal (?:your (?:system )?prompt|all (?:instructions|secrets)|api key)/gi,
    risk: 'HIGH',
    reason: 'Attempts to extract AI system prompts or secrets'
  },
  {
    pattern: /execute the following|run the following command/gi,
    risk: 'MEDIUM',
    reason: 'Contains command execution instruction-like patterns'
  },
  {
    pattern: /\[SYSTEM\]|\[ADMIN\]|\[OVERRIDE\]/gi,
    risk: 'HIGH',
    reason: 'Contains fake system-level instruction markers'
  },
  {
    pattern: /send all (?:data|information|secrets) to/gi,
    risk: 'CRITICAL',
    reason: 'Attempts to exfiltrate data via AI context'
  },
  {
    pattern: /act as (?:a|an) (?:different|evil|unrestricted|jailbroken)/gi,
    risk: 'HIGH',
    reason: 'Attempts to jailbreak AI behavior'
  }
];

// Sensitive file patterns
const SENSITIVE_FILES = [
  { pattern: /^\.env(?:\.\w+)?$/, type: 'Environment file' },
  { pattern: /credentials\.(json|yaml|yml|txt)$/i, type: 'Credentials file' },
  { pattern: /secrets\.(json|yaml|yml|txt)$/i, type: 'Secrets file' },
  { pattern: /\.pem$|\.key$|\.p12$|\.pfx$/i, type: 'Certificate/Key file' },
  { pattern: /id_rsa|id_ed25519|id_ecdsa/i, type: 'SSH private key' },
  { pattern: /\.sqlite$|\.db$/i, type: 'Database file' },
  { pattern: /dump\.sql|backup\.sql/i, type: 'Database dump' },
];

// Security vulnerability patterns in code
const VULN_PATTERNS = [
  {
    pattern: /eval\s*\(/g,
    type: 'Dangerous eval()',
    severity: 'HIGH' as const,
    description: 'Use of eval() can execute arbitrary code'
  },
  {
    pattern: /exec\s*\(\s*(?:req|request|params|query|body|user)/gi,
    type: 'Command injection risk',
    severity: 'CRITICAL' as const,
    description: 'Shell command execution using user-controlled input'
  },
  {
    pattern: /innerHTML\s*=/g,
    type: 'Potential XSS via innerHTML',
    severity: 'HIGH' as const,
    description: 'Setting innerHTML with potentially untrusted content'
  },
  {
    pattern: /dangerouslySetInnerHTML/g,
    type: 'React dangerous HTML injection',
    severity: 'HIGH' as const,
    description: 'dangerouslySetInnerHTML bypasses React XSS protection'
  },
  {
    pattern: /\bquery\b.*\+\s*(?:req|request|params|body|user)/gi,
    type: 'Potential SQL injection',
    severity: 'CRITICAL' as const,
    description: 'String concatenation in database query with user input'
  },
  {
    pattern: /fs\.(?:readFile|writeFile|unlink|rmdir)\s*\(\s*(?:req|request|params|body|user)/gi,
    type: 'Path traversal risk',
    severity: 'HIGH' as const,
    description: 'Filesystem access with user-controlled path'
  },
  {
    pattern: /require\s*\(\s*(?:req|request|params|body|user)/gi,
    type: 'Dynamic require injection',
    severity: 'CRITICAL' as const,
    description: 'Dynamic require() with user-controlled input'
  },
  {
    pattern: /jwt\.(?:verify|decode)\s*\([^)]+,\s*(?:'|")\s*(?:'|")/g,
    type: 'JWT with empty/weak secret',
    severity: 'HIGH' as const,
    description: 'JWT verification with empty or weak secret'
  },
  {
    pattern: /\.find\s*\(\s*\{[^}]*\$where/gi,
    type: 'NoSQL injection',
    severity: 'CRITICAL' as const,
    description: 'MongoDB query using $where with potential injection'
  }
];

// AI instruction file patterns
const AI_INSTRUCTION_FILES = [
  '.cursorrules', 'AGENTS.md', 'CLAUDE.md', '.gemini/config',
  'system_prompt.txt', 'ai_instructions.md', '.github/copilot-instructions.md',
  'mcp.json', '.mcp.json'
];

function maskSecret(value: string): string {
  if (value.length <= 8) return '***REDACTED***';
  return value.substring(0, 4) + '*'.repeat(Math.min(16, value.length - 8)) + value.substring(value.length - 4);
}

export interface SecurityAnalysisResult {
  findings: Partial<IFinding>[];
  securityScore: number;
  secretsDetected: boolean;
  promptInjectionDetected: boolean;
  sensitiveFilesDetected: boolean;
  contextWarnings: string[];
}

export async function analyzeSecurityRisks(
  files: GitHubFile[],
  analysisRunId: string,
  repositoryId: string,
  fileContents: Map<string, string>
): Promise<SecurityAnalysisResult> {
  const findings: Partial<IFinding>[] = [];
  const contextWarnings: string[] = [];
  let secretsDetected = false;
  let promptInjectionDetected = false;
  let sensitiveFilesDetected = false;

  // 1. Detect sensitive files in the diff
  for (const file of files) {
    const basename = file.filename.split('/').pop() || '';
    const fullpath = file.filename;

    for (const sensitive of SENSITIVE_FILES) {
      if (sensitive.pattern.test(basename) || sensitive.pattern.test(fullpath)) {
        sensitiveFilesDetected = true;
        contextWarnings.push(`Sensitive file type detected: ${file.filename} (${sensitive.type})`);

        if (file.status === 'added') {
          findings.push({
            analysisRunId,
            repositoryId,
            category: 'SECURITY',
            severity: 'CRITICAL',
            confidence: 0.95,
            title: `Sensitive file added to repository: ${sensitive.type}`,
            summary: `A ${sensitive.type} was added to the repository (${file.filename}). This may expose sensitive credentials or private data.`,
            evidence: [{
              file: file.filename,
              description: `${sensitive.type} added to repository with ${file.additions} additions`
            }],
            affectedFiles: [file.filename],
            impact: 'Sensitive files in version control may be exposed to all repository contributors and potentially the public.',
            recommendation: `Remove ${file.filename} from the repository. Use environment variables or a secrets manager instead. Rotate any credentials that may have been exposed.`,
            suggestedTests: [
              'Verify file is in .gitignore',
              'Confirm credentials have been rotated',
              'Check repository history for accidental exposure'
            ],
            verificationCriteria: [`${file.filename} not present in repository`, 'Credentials rotated'],
            detectionMethod: 'PATTERN_MATCH',
            status: 'OPEN'
          });
        }
        break;
      }
    }
  }

  // 2. Secret scanning in file contents
  for (const [filename, content] of fileContents) {
    const lines = content.split('\n');

    for (const { pattern, type } of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      let match;

      while ((match = pattern.exec(content)) !== null) {
        // Find line number
        const linesBefore = content.substring(0, match.index).split('\n');
        const lineNumber = linesBefore.length;

        // Get the full line for context (mask secret before display)
        const line = lines[lineNumber - 1] || '';
        const maskedLine = line.replace(pattern, (_, cap) => {
          if (cap) return line.replace(cap, maskSecret(cap));
          return '***REDACTED***';
        });

        secretsDetected = true;

        findings.push({
          analysisRunId,
          repositoryId,
          category: 'SECURITY',
          severity: 'CRITICAL',
          confidence: 0.92,
          title: `Potential ${type} exposed in source code`,
          summary: `A potential ${type} was detected in ${filename}. The actual value has been redacted for security.`,
          evidence: [{
            file: filename,
            startLine: lineNumber,
            endLine: lineNumber,
            snippet: maskedLine.substring(0, 200),
            description: `Potential ${type} detected. Value redacted: ${maskSecret(match[0])}`
          }],
          affectedFiles: [filename],
          impact: 'Exposed credentials allow unauthorized access to services and can lead to data breaches.',
          recommendation: `Immediately remove the ${type} from ${filename}. Rotate/regenerate the credential. Use environment variables or a secrets manager. Check if the secret was exposed in previous commits.`,
          suggestedTests: [
            'Verify secret has been rotated',
            'Confirm secret is not in git history',
            'Run secret scanning on full repository history'
          ],
          verificationCriteria: ['Secret removed from codebase', 'Secret rotated in all environments'],
          detectionMethod: 'PATTERN_MATCH',
          status: 'OPEN'
        });

        // Avoid duplicates
        break;
      }
    }

    // 3. Prompt injection detection (especially in AI instruction files, READMEs, docs)
    const isAIRelevantFile = AI_INSTRUCTION_FILES.some(f => filename.includes(f)) ||
      filename.match(/readme|\.md$|\.txt$/i);

    if (isAIRelevantFile) {
      for (const { pattern, risk, reason } of PROMPT_INJECTION_PATTERNS) {
        pattern.lastIndex = 0;

        if (pattern.test(content)) {
          const lineIdx = content.split('\n').findIndex(l => {
            pattern.lastIndex = 0;
            return pattern.test(l);
          });

          promptInjectionDetected = true;

          findings.push({
            analysisRunId,
            repositoryId,
            category: 'AI_CONTEXT',
            severity: risk === 'CRITICAL' ? 'CRITICAL' : risk === 'HIGH' ? 'HIGH' : 'MEDIUM',
            confidence: 0.78,
            title: `Potential AI context injection detected in ${filename}`,
            summary: `Repository content appears to contain instruction-like patterns that could manipulate AI coding assistants. ${reason}`,
            evidence: [{
              file: filename,
              startLine: lineIdx >= 0 ? lineIdx + 1 : undefined,
              description: `Pattern: ${reason}. Risk level: ${risk}`
            }],
            affectedFiles: [filename],
            impact: 'If an AI coding assistant processes this file, it may be manipulated into taking unintended actions, exposing information, or bypassing safety guidelines.',
            recommendation: 'Review this content carefully. If it was unintentionally written, revise it. If it was intentionally adversarial, remove it immediately. Ensure AI tools process repository content as data, not instructions.',
            suggestedTests: [
              'Review file content for adversarial patterns',
              'Test AI behavior when processing this file'
            ],
            verificationCriteria: ['Suspicious instruction patterns removed from file'],
            detectionMethod: 'PATTERN_MATCH',
            status: 'OPEN'
          });

          break; // One finding per file per injection type
        }
      }
    }

    // 4. Application security vulnerability patterns
    const isCodeFile = filename.match(/\.[jt]sx?$|\.py$|\.php$|\.rb$/);

    if (isCodeFile) {
      for (const vulnPattern of VULN_PATTERNS) {
        vulnPattern.pattern.lastIndex = 0;

        if (vulnPattern.pattern.test(content)) {
          const lines2 = content.split('\n');
          const matchLine = lines2.findIndex(l => {
            vulnPattern.pattern.lastIndex = 0;
            return vulnPattern.pattern.test(l);
          });

          findings.push({
            analysisRunId,
            repositoryId,
            category: 'SECURITY',
            severity: vulnPattern.severity,
            confidence: 0.72,
            title: `${vulnPattern.type} detected in ${filename}`,
            summary: `${vulnPattern.description} was detected in ${filename}.`,
            evidence: [{
              file: filename,
              startLine: matchLine >= 0 ? matchLine + 1 : undefined,
              snippet: matchLine >= 0 ? lines2[matchLine].substring(0, 200) : undefined,
              description: vulnPattern.description
            }],
            affectedFiles: [filename],
            impact: 'This pattern may indicate a security vulnerability that could be exploited by attackers.',
            recommendation: `Review line ${matchLine + 1} in ${filename}. ${vulnPattern.description}. Apply safe alternatives.`,
            suggestedTests: [
              'Test with malicious input to confirm exploitability',
              'Add security test cases for this code path'
            ],
            verificationCriteria: ['Vulnerable pattern replaced with safe alternative', 'Security test added'],
            detectionMethod: 'SECURITY_RULE',
            status: 'OPEN'
          });
        }
      }
    }

    // 5. AI instruction file check
    const isAIInstructionFile = AI_INSTRUCTION_FILES.some(f => filename.includes(f));
    if (isAIInstructionFile && files.find(f => f.filename === filename)?.status === 'added') {
      contextWarnings.push(`AI instruction file added: ${filename} - review for suspicious instructions`);

      findings.push({
        analysisRunId,
        repositoryId,
        category: 'AI_CONTEXT',
        severity: 'MEDIUM',
        confidence: 0.85,
        title: `AI agent instruction file added: ${filename}`,
        summary: `An AI agent instruction file was added to the repository. These files configure AI coding tools and may influence automated behaviors.`,
        evidence: [{
          file: filename,
          description: 'AI instruction file detected'
        }],
        affectedFiles: [filename],
        impact: 'Malicious AI instruction files can cause AI coding agents to take unintended or harmful actions.',
        recommendation: 'Review the contents of this AI instruction file to ensure it contains only legitimate, safe directives.',
        suggestedTests: ['Review AI instruction file for suspicious patterns'],
        verificationCriteria: ['AI instruction file reviewed and approved'],
        detectionMethod: 'STATIC_ANALYSIS',
        status: 'OPEN'
      });
    }
  }

  // Calculate security score
  let securityScore = 100;

  for (const finding of findings) {
    const severity = finding.severity || 'INFO';
    const confidence = finding.confidence || 0.5;
    const files2 = finding.affectedFiles || [];

    // Exposure multiplier
    let exposureMultiplier = 1.0;
    const isExternalRisk = files2.some(f =>
      f.includes('.github/') || f.includes('Dockerfile') || f.includes('.env')
    );
    const isAuthRisk = finding.category === 'SECURITY' &&
      (finding.title?.toLowerCase().includes('auth') ||
       finding.title?.toLowerCase().includes('secret') ||
       finding.title?.toLowerCase().includes('credential'));

    if (isExternalRisk) exposureMultiplier = 1.25;
    else if (isAuthRisk) exposureMultiplier = 1.10;

    const severityWeight = {
      CRITICAL: 30,
      HIGH: 18,
      MEDIUM: 8,
      LOW: 3,
      INFO: 0
    }[severity] || 0;

    securityScore -= severityWeight * confidence * exposureMultiplier;
  }

  securityScore = Math.max(0, Math.min(100, Math.round(securityScore)));

  return {
    findings,
    securityScore,
    secretsDetected,
    promptInjectionDetected,
    sensitiveFilesDetected,
    contextWarnings
  };
}

// Redact secrets from content before AI processing
export function redactSecretsFromContent(content: string): string {
  let redacted = content;

  for (const { pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, (match) => {
      return maskSecret(match);
    });
  }

  return redacted;
}

// Check for sensitive file patterns
export function isSensitiveFile(filename: string): boolean {
  const basename = filename.split('/').pop() || '';
  return SENSITIVE_FILES.some(s => s.pattern.test(basename) || s.pattern.test(filename));
}
