import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { PullRequest } from '../models/PullRequest';
import { Repository } from '../models/Repository';
import { User } from '../models/User';
import { AnalysisRun } from '../models/AnalysisRun';
import { createError } from '../middleware/errorHandler';
import { getPullRequest, getOctokitForRepository } from '../github/githubService';
import { z } from 'zod';

export const pullRequestsRouter = Router();
pullRequestsRouter.use(requireAuth);

const IngestPRSchema = z.object({
  repositoryId: z.string(),
  prNumber: z.number().int().positive()
});

// Ingest/fetch a specific PR
pullRequestsRouter.post('/ingest', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = IngestPRSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError('Invalid request', 400, 'VALIDATION_ERROR'));
    }

    const { repositoryId, prNumber } = parsed.data;
    const repo = await Repository.findOne({ _id: repositoryId, userId: req.session.userId });
    if (!repo) return next(createError('Repository not found', 404, 'NOT_FOUND'));

    const user = await User.findById(req.session.userId).select('+githubAccessToken');
    if (!user) return next(createError('User not found', 404, 'NOT_FOUND'));

    let prData: {
      number: number;
      title: string;
      body?: string;
      user: { login: string; avatar_url: string };
      base: { sha: string; ref: string };
      head: { sha: string; ref: string };
      html_url: string;
      additions: number;
      deletions: number;
      changed_files: number;
      state: string;
      merged_at?: string;
    };

    // Demo mode
    if (user.githubUserId === 'demo-user-001' || !user.githubAccessToken) {
      const { DEMO_PULL_REQUESTS } = await import('../demo/demoData');
      const demoPr = DEMO_PULL_REQUESTS.find(p => p.number === prNumber);
      if (!demoPr) return next(createError('PR not found', 404, 'NOT_FOUND'));
      prData = {
        number: demoPr.number,
        title: demoPr.title,
        body: demoPr.body,
        user: { login: demoPr.author, avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=pr' },
        base: { sha: demoPr.baseSha, ref: 'main' },
        head: { sha: demoPr.headSha, ref: 'feature/refund-endpoint' },
        html_url: `https://github.com/demo/payment-service/pull/${prNumber}`,
        additions: demoPr.additions,
        deletions: demoPr.deletions,
        changed_files: demoPr.changedFiles,
        state: 'open'
      };
    } else {
      if (!repo.installationId) return next(createError('GitHub App is not installed for this repository.', 409, 'GITHUB_APP_NOT_INSTALLED'));
      prData = await getPullRequest(await getOctokitForRepository(repo.installationId), repo.owner, repo.name, prNumber);
    }

    // Upsert PR
    const pr = await PullRequest.findOneAndUpdate(
      { repositoryId: repo.id, githubPrNumber: prNumber },
      {
        repositoryId: repo.id,
        githubPrNumber: prData.number,
        title: prData.title,
        body: prData.body,
        author: prData.user.login,
        authorAvatarUrl: prData.user.avatar_url,
        baseSha: prData.base.sha,
        headSha: prData.head.sha,
        baseBranch: prData.base.ref,
        headBranch: prData.head.ref,
        state: (prData.state === 'closed' && prData.merged_at) ? 'merged' : prData.state as 'open' | 'closed',
        githubUrl: prData.html_url,
        additions: prData.additions || 0,
        deletions: prData.deletions || 0,
        changedFiles: prData.changed_files || 0
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, data: pr });
  } catch (err) {
    next(err);
  }
});

// Get a specific PR
pullRequestsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pr = await PullRequest.findById(req.params.id);
    if (!pr) return next(createError('Pull request not found', 404, 'NOT_FOUND'));

    // Verify repo ownership
    const repo = await Repository.findOne({ _id: pr.repositoryId, userId: req.session.userId });
    if (!repo) return next(createError('Access denied', 403, 'FORBIDDEN'));

    // Get analyses for this PR
    const analyses = await AnalysisRun.find({ pullRequestId: pr.id }).sort({ createdAt: -1 });

    res.json({ success: true, data: { pullRequest: pr, analyses } });
  } catch (err) {
    next(err);
  }
});
