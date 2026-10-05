import { isSensitiveFile, redactSecretsFromContent } from '../analyzers/security/securityAnalyzer';

const INSTRUCTION_PATTERNS = [
  /ignore (?:all |previous |prior )?(?:instructions|rules|guidance)/i,
  /(?:system|developer|assistant)\s*(?:prompt|message|instruction)/i,
  /you are now|act as|jailbreak|do not follow/i,
  /reveal (?:the )?(?:secret|prompt|token|key)/i
];

export function hasPromptInjection(content: string): boolean {
  return INSTRUCTION_PATTERNS.some(pattern => pattern.test(content)) || /<\/?(?:system|assistant|developer)[^>]*>/i.test(content);
}

/** Treat repository material as untrusted data before it reaches an AI provider. */
export function firewallRepositoryContext(filename: string, content: string, limit = 3000): string {
  if (isSensitiveFile(filename)) return '[REDACTED: sensitive file]';
  const redacted = redactSecretsFromContent(content)
    .replace(/\b(?:sk-|gh[pousr]_?|github_pat_)[A-Za-z0-9_-]{16,}\b/gi, '[REDACTED_SECRET]')
    .replace(/\b(?:api[_-]?key|token|password|secret)\s*[=:]\s*['"]?[^\s'"`]+/gi, '[REDACTED_SECRET]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/<\/?(system|assistant|developer)[^>]*>/gi, '[UNTRUSTED_MARKUP]');
  return hasPromptInjection(redacted)
    ? `[UNTRUSTED_REPOSITORY_CONTENT: possible prompt injection]\n${redacted}`.slice(0, limit)
    : redacted.slice(0, limit);
}
