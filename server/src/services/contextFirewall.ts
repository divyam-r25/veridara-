import { isSensitiveFile, redactSecretsFromContent } from '../analyzers/security/securityAnalyzer';

/** Treat repository material as untrusted data before it reaches an AI provider. */
export function firewallRepositoryContext(filename: string, content: string, limit = 3000): string {
  if (isSensitiveFile(filename)) return '[REDACTED: sensitive file]';
  return redactSecretsFromContent(content)
    .replace(/<\/?(system|assistant|developer)[^>]*>/gi, '[UNTRUSTED_MARKUP]')
    .slice(0, limit);
}
