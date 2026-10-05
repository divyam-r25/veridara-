import { IFinding } from '../models/Finding';
import { IAnalysisRun } from '../models/AnalysisRun';
import { IRepository } from '../models/Repository';
import { IPullRequest } from '../models/PullRequest';

interface FixPackInput {
  analysis: IAnalysisRun;
  repository: IRepository;
  pullRequest: IPullRequest;
  findings: IFinding[];
}

export function generateFixPack(input: FixPackInput): string {
  const { analysis, repository, pullRequest, findings } = input;

  const criticalFindings = findings.filter(f => f.severity === 'CRITICAL' && f.status === 'OPEN');
  const highFindings = findings.filter(f => f.severity === 'HIGH' && f.status === 'OPEN');
  const primaryFindings = [...criticalFindings, ...highFindings].slice(0, 5);

  const affectedFiles = [...new Set(primaryFindings.flatMap(f => f.affectedFiles || []))];

  const sections: string[] = [];

  sections.push(`# ReleaseRadar AI Fix Pack`);
  sections.push(`\n**Generated:** ${new Date().toISOString()}`);
  sections.push(`**Repository:** ${repository.fullName}`);
  sections.push(`**Pull Request:** #${pullRequest.githubPrNumber} — ${pullRequest.title}`);
  sections.push(`**Commit:** ${analysis.headSha.substring(0, 8)}`);
  sections.push(`**Release Score:** ${analysis.releaseScore}/100 (${analysis.decision})`);
  sections.push(`**Security Score:** ${analysis.securityScore}/100`);

  sections.push(`\n---\n`);

  sections.push(`## OBJECTIVE\n`);
  sections.push(`Resolve ${primaryFindings.length} critical/high-risk finding(s) identified in ${repository.fullName} PR #${pullRequest.githubPrNumber} to achieve a release-ready state.`);

  sections.push(`\n## CURRENT RISK\n`);
  sections.push(`**Release Score:** ${analysis.releaseScore}/100 — ${analysis.decision}`);
  sections.push(`**Security Score:** ${analysis.securityScore}/100`);

  if (criticalFindings.length > 0) {
    sections.push(`\n⚠️ **${criticalFindings.length} CRITICAL finding(s) — release is blocked until resolved.**`);
  }

  sections.push(`\n## FINDINGS TO ADDRESS\n`);

  primaryFindings.forEach((finding, i) => {
    sections.push(`### ${i + 1}. [${finding.severity}] ${finding.title}\n`);
    sections.push(`**Category:** ${finding.category}`);
    sections.push(`**Confidence:** ${Math.round(finding.confidence * 100)}%`);
    sections.push(`**Detection:** ${finding.detectionMethod.replace(/_/g, ' ')}`);
    sections.push(`\n**Summary:**\n${finding.summary}`);
    sections.push(`\n**Impact:**\n${finding.impact}`);

    if (finding.evidence && finding.evidence.length > 0) {
      sections.push(`\n**Evidence:**`);
      finding.evidence.forEach(e => {
        const location = e.startLine ? `${e.file}:${e.startLine}${e.endLine !== e.startLine ? `-${e.endLine}` : ''}` : e.file;
        sections.push(`- \`${location}\`: ${e.description}`);
        if (e.snippet) {
          sections.push(`\n  \`\`\`\n  ${e.snippet}\n  \`\`\``);
        }
      });
    }

    sections.push(`\n**Required Fix:**\n${finding.recommendation}`);

    if (finding.suggestedTests && finding.suggestedTests.length > 0) {
      sections.push(`\n**Required Tests:**`);
      finding.suggestedTests.forEach((t, ti) => sections.push(`${ti + 1}. ${t}`));
    }

    sections.push('');
  });

  sections.push(`## AFFECTED FILES\n`);
  if (affectedFiles.length > 0) {
    affectedFiles.forEach(f => sections.push(`- \`${f}\``));
  } else {
    sections.push('- Review all files changed in this PR');
  }

  sections.push(`\n## CONSTRAINTS\n`);
  sections.push(`- Do not modify unrelated code or tests.`);
  sections.push(`- Preserve the existing API response format unless a breaking change is intentional and documented.`);
  sections.push(`- Do not introduce new dependencies unless strictly necessary.`);
  sections.push(`- All existing tests must continue to pass.`);
  sections.push(`- Never hardcode secrets or credentials in source code.`);

  sections.push(`\n## ACCEPTANCE CRITERIA\n`);
  primaryFindings.forEach((finding, i) => {
    if (finding.verificationCriteria && finding.verificationCriteria.length > 0) {
      sections.push(`**Finding ${i + 1}:**`);
      finding.verificationCriteria.forEach(vc => sections.push(`- ${vc}`));
    }
  });
  sections.push(`- Release Score improves above 80`);
  sections.push(`- No new critical or high findings introduced`);

  sections.push(`\n## REQUIRED TESTS\n`);
  const allTests = [...new Set(primaryFindings.flatMap(f => f.suggestedTests || []))];
  allTests.forEach((t, i) => sections.push(`${i + 1}. ${t}`));

  sections.push(`\n## SECURITY REQUIREMENTS\n`);
  sections.push(`- No secrets or credentials in source code`);
  sections.push(`- All user inputs must be validated and sanitized`);
  sections.push(`- Authorization checks must be present on all protected routes`);
  sections.push(`- No eval() or dynamic code execution with user input`);

  sections.push(`\n## VALIDATION\n`);
  sections.push(`After making changes:`);
  sections.push(`1. Run the test suite: \`npm test\` (or your project's test command)`);
  sections.push(`2. Run linting: \`npm run lint\` (if configured)`);
  sections.push(`3. Build the project: \`npm run build\`  `);
  sections.push(`4. Commit the changes and push to trigger ReleaseRadar re-analysis`);

  sections.push(`\n## POST-FIX CHECKLIST\n`);
  sections.push(`- [ ] All findings addressed`);
  sections.push(`- [ ] All required tests written and passing`);
  sections.push(`- [ ] No new security issues introduced`);
  sections.push(`- [ ] No secrets in codebase`);
  sections.push(`- [ ] Code reviewed by another developer`);
  sections.push(`- [ ] ReleaseRadar re-analysis shows improved scores`);

  sections.push(`\n---`);
  sections.push(`\n*Generated by ReleaseRadar — The verification loop for AI-assisted software development.*`);
  sections.push(`*This Fix Pack is for guidance only. All AI-generated suggestions should be reviewed by a qualified developer.*`);

  return sections.join('\n');
}
