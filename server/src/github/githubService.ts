import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { logger } from '../utils/logger';

export interface GitHubFile {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  raw_url?: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  body?: string;
  state: string;
  user: { login: string; avatar_url: string };
  base: { sha: string; ref: string };
  head: { sha: string; ref: string };
  html_url: string;
  additions: number;
  deletions: number;
  changed_files: number;
  merged_at?: string;
}

// Get an Octokit instance using a user OAuth token
export function getOctokitForUser(token: string): Octokit {
  return new Octokit({ auth: token });
}

// Get an Octokit instance using GitHub App installation
export async function getOctokitForInstallation(installationId: string): Promise<Octokit> {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim().replace(/\\n/g, '\n');

  if (!appId || !privateKey) {
    throw new Error('GitHub App credentials not configured');
  }

  const auth = createAppAuth({
    appId,
    privateKey,
    installationId: parseInt(installationId)
  });

  const { token } = await auth({ type: 'installation' });
  return new Octokit({ auth: token });
}

/** Return the installation that gives the Veridara App access to this repository. */
export async function getRepositoryInstallation(owner: string, repo: string): Promise<string | null> {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim().replace(/\\n/g, '\n');
  if (!appId || !privateKey) throw new Error('GitHub App credentials not configured');
  const appAuth = createAppAuth({ appId, privateKey });
  const { token } = await appAuth({ type: 'app' });
  try {
    const { data } = await new Octokit({ auth: token }).apps.getRepoInstallation({ owner, repo });
    return String(data.id);
  } catch (error: unknown) {
    if (typeof error === 'object' && error && 'status' in error && (error as { status: number }).status === 404) return null;
    throw error;
  }
}

/** Prefer short-lived GitHub App installation tokens for repository work. */
export async function getOctokitForRepository(installationId?: string, userToken?: string): Promise<Octokit> {
  if (installationId && process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY) {
    return getOctokitForInstallation(installationId);
  }
  // OAuth is used only to identify the user. Repository access must use an
  // installation token with repository-scoped, short-lived credentials.
  void userToken;
  throw new Error('GitHub App is not installed for this repository');
}

// Exchange OAuth code for access token
export async function exchangeCodeForToken(code: string): Promise<string> {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GITHUB_CALLBACK_URL?.trim();

  if (!clientId || !clientSecret) {
    throw new Error('GitHub OAuth credentials not configured');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code
  });

  if (redirectUri) {
    params.set('redirect_uri', redirectUri);
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  const data = await response.json() as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Failed to exchange code for token');
  }

  return data.access_token;
}

// Get user info from GitHub
export async function getGitHubUser(token: string) {
  const octokit = getOctokitForUser(token);
  const { data } = await octokit.users.getAuthenticated();
  return data;
}

// List repositories accessible to the user
export async function listUserRepos(token: string, page = 1) {
  const octokit = getOctokitForUser(token);
  const { data } = await octokit.repos.listForAuthenticatedUser({
    sort: 'updated',
    per_page: 30,
    page
  });
  return data;
}

// Get a specific repository
export async function getRepo(token: string, owner: string, repo: string) {
  const octokit = getOctokitForUser(token);
  const { data } = await octokit.repos.get({ owner, repo });
  return data;
}

// List pull requests for a repository
export async function listPullRequests(auth: string | Octokit, owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open') {
  const octokit = typeof auth === 'string' ? getOctokitForUser(auth) : auth;
  const { data } = await octokit.pulls.list({ owner, repo, state, per_page: 30 });
  return data;
}

// Get a specific PR with full details
export async function getPullRequest(auth: string | Octokit, owner: string, repo: string, pull_number: number): Promise<GitHubPR> {
  const octokit = typeof auth === 'string' ? getOctokitForUser(auth) : auth;
  const { data } = await octokit.pulls.get({ owner, repo, pull_number });
  return data as unknown as GitHubPR;
}

// Get files changed in a PR
export async function getPRFiles(auth: string | Octokit, owner: string, repo: string, pull_number: number): Promise<GitHubFile[]> {
  const octokit = typeof auth === 'string' ? getOctokitForUser(auth) : auth;
  const { data } = await octokit.pulls.listFiles({ owner, repo, pull_number, per_page: 100 });
  return data as unknown as GitHubFile[];
}

// Get file content at a specific ref
export async function getFileContent(auth: string | Octokit, owner: string, repo: string, path: string, ref: string): Promise<string | null> {
  try {
    const octokit = typeof auth === 'string' ? getOctokitForUser(auth) : auth;
    const { data } = await octokit.repos.getContent({ owner, repo, path, ref });

    if ('content' in data && data.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch (err) {
    logger.debug(`Could not fetch ${path} at ${ref}: ${err}`);
    return null;
  }
}

// Validate webhook signature
export async function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const crypto = await import('crypto');
    const expectedSig = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Constant-time comparison
    if (expectedSig.length !== signature.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(expectedSig),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}
