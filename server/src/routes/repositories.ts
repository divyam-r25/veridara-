import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { Repository } from '../models/Repository';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { listUserRepos, getRepo } from '../github/githubService';
import { createError } from '../middleware/errorHandler';
import { z } from 'zod';
import { DEMO_REPOSITORIES } from '../demo/demoData';

export const repositoriesRouter = Router();
repositoriesRouter.use(requireAuth);

// List connected repositories
repositoriesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = await Repository.find({ userId: req.session.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: repos });
  } catch (err) {
    next(err);
  }
});

// List available GitHub repositories to connect
repositoriesRouter.get('/available', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.session.userId).select('+githubAccessToken');
    if (!user) return next(createError('User not found', 404, 'USER_NOT_FOUND'));

    // Demo mode
    if (user.githubUserId === 'demo-user-001' || !user.githubAccessToken) {
      return res.json({ success: true, data: DEMO_REPOSITORIES, demoMode: true });
    }

    const repos = await listUserRepos(user.githubAccessToken);
    res.json({ success: true, data: repos });
  } catch (err) {
    next(err);
  }
});

const ConnectRepoSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  githubRepoId: z.string().optional()
});

// Connect a repository
repositoriesRouter.post('/connect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = ConnectRepoSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError('Invalid request body', 400, 'VALIDATION_ERROR'));
    }

    const { owner, name } = parsed.data;
    const user = await User.findById(req.session.userId).select('+githubAccessToken');
    if (!user) return next(createError('User not found', 404, 'USER_NOT_FOUND'));

    let repoId: string;
    let defaultBranch: string;
    let language: string | undefined;
    let description: string | undefined;
    let isPrivate: boolean;

    // Demo mode
    if (user.githubUserId === 'demo-user-001' || !user.githubAccessToken) {
      const demoRepo = DEMO_REPOSITORIES.find(r => r.name === name);
      repoId = String(demoRepo?.id ?? 999999001);
      defaultBranch = demoRepo?.default_branch ?? 'main';
      language = demoRepo?.language;
      description = demoRepo?.description;
      isPrivate = demoRepo?.private ?? false;
    } else {
      const ghRepo = await getRepo(user.githubAccessToken, owner, name);
      repoId = String(ghRepo.id);
      defaultBranch = ghRepo.default_branch;
      language = ghRepo.language ?? undefined;   // convert null → undefined
      description = ghRepo.description ?? undefined;
      isPrivate = ghRepo.private;
    }

    const existing = await Repository.findOne({ userId: req.session.userId, githubRepoId: repoId });
    if (existing) {
      return res.json({ success: true, data: existing, message: 'Repository already connected' });
    }

    const repo = await Repository.create({
      githubRepoId: repoId,
      userId: req.session.userId,
      owner,
      name,
      fullName: `${owner}/${name}`,
      defaultBranch,
      language,
      description,
      private: isPrivate,
      enabled: true
    });

    await AuditLog.create({
      userId: req.session.userId,
      action: 'REPOSITORY_CONNECTED',
      resourceType: 'Repository',
      resourceId: repo.id,
      metadata: { fullName: repo.fullName }
    });

    res.status(201).json({ success: true, data: repo });
  } catch (err) {
    next(err);
  }
});

// Get a specific repository
repositoriesRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await Repository.findOne({ _id: req.params.id, userId: req.session.userId });
    if (!repo) return next(createError('Repository not found', 404, 'NOT_FOUND'));
    res.json({ success: true, data: repo });
  } catch (err) {
    next(err);
  }
});

// List pull requests for a repository
repositoriesRouter.get('/:id/pulls', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await Repository.findOne({ _id: req.params.id, userId: req.session.userId });
    if (!repo) return next(createError('Repository not found', 404, 'NOT_FOUND'));

    const user = await User.findById(req.session.userId).select('+githubAccessToken');
    if (!user) return next(createError('User not found', 404, 'USER_NOT_FOUND'));

    // Demo mode
    if (user.githubUserId === 'demo-user-001' || !user.githubAccessToken) {
      const { DEMO_PULL_REQUESTS } = await import('../demo/demoData');
      return res.json({ success: true, data: DEMO_PULL_REQUESTS, demoMode: true });
    }

    const { listPullRequests } = await import('../github/githubService');
    const state = (req.query.state as 'open' | 'closed' | 'all') || 'open';
    const prs = await listPullRequests(user.githubAccessToken, repo.owner, repo.name, state);

    res.json({ success: true, data: prs });
  } catch (err) {
    next(err);
  }
});
