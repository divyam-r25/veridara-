import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { AnalysisRun } from '../models/AnalysisRun';
import { Finding } from '../models/Finding';
import { FixPack } from '../models/FixPack';
import { PullRequest } from '../models/PullRequest';
import { Repository } from '../models/Repository';
import { AuditLog } from '../models/AuditLog';
import { dispatchLoopIteration } from '../services/loopController';
import { createError } from '../middleware/errorHandler';
import { z } from 'zod';

export const analysesRouter = Router();
analysesRouter.use(requireAuth);

const CreateAnalysisSchema = z.object({
  pullRequestId: z.string(),
  isDemoAnalysis: z.boolean().optional()
});

// Create a new analysis run
analysesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CreateAnalysisSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError('Invalid request', 400, 'VALIDATION_ERROR'));
    }

    const { pullRequestId, isDemoAnalysis } = parsed.data;

    const pr = await PullRequest.findById(pullRequestId);
    if (!pr) return next(createError('Pull request not found', 404, 'NOT_FOUND'));

    // Verify ownership
    const repo = await Repository.findOne({ _id: pr.repositoryId, userId: req.session.userId });
    if (!repo) return next(createError('Access denied', 403, 'FORBIDDEN'));

    const previousAnalysis = await AnalysisRun.findOne(
      { pullRequestId: pr.id },
      {},
      { sort: { createdAt: -1 } }
    );

    const iterationNumber = previousAnalysis ? previousAnalysis.iterationNumber + 1 : 1;
    if (iterationNumber > 3) {
      return next(createError('Maximum automatic verification iterations reached; manual review is required', 409, 'MANUAL_REVIEW_REQUIRED'));
    }

    const analysisRun = await AnalysisRun.create({
      pullRequestId: pr.id,
      repositoryId: repo.id,
      iterationNumber,
      baseSha: pr.baseSha,
      headSha: pr.headSha,
      previousAnalysisId: previousAnalysis?.id,
      status: 'RECEIVED',
      startedAt: new Date()
    });

    await AuditLog.create({
      userId: req.session.userId,
      action: 'ANALYSIS_STARTED',
      resourceType: 'AnalysisRun',
      resourceId: analysisRun.id,
      metadata: { repositoryId: repo.id, prNumber: pr.githubPrNumber, iterationNumber }
    });

    await dispatchLoopIteration(analysisRun.id, isDemoAnalysis
      ? { demo: true, pullRequestId: pr.id, repositoryId: repo.id }
      : { demo: false });

    res.status(201).json({ success: true, data: analysisRun });
  } catch (err) {
    next(err);
  }
});

// Get analysis run
analysesRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const analysis = await AnalysisRun.findById(req.params.id);
    if (!analysis) return next(createError('Analysis not found', 404, 'NOT_FOUND'));

    const repo = await Repository.findOne({ _id: analysis.repositoryId, userId: req.session.userId });
    if (!repo) return next(createError('Access denied', 403, 'FORBIDDEN'));

    res.json({ success: true, data: analysis });
  } catch (err) {
    next(err);
  }
});

// Get findings for an analysis
analysesRouter.get('/:id/findings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const analysis = await AnalysisRun.findById(req.params.id);
    if (!analysis) return next(createError('Analysis not found', 404, 'NOT_FOUND'));

    const repo = await Repository.findOne({ _id: analysis.repositoryId, userId: req.session.userId });
    if (!repo) return next(createError('Access denied', 403, 'FORBIDDEN'));

    const findings = await Finding.find({ analysisRunId: req.params.id }).sort({ severity: 1, confidence: -1 });

    res.json({ success: true, data: findings });
  } catch (err) {
    next(err);
  }
});

// Get fix pack for an analysis
analysesRouter.get('/:id/fix-pack', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const analysis = await AnalysisRun.findById(req.params.id);
    if (!analysis) return next(createError('Analysis not found', 404, 'NOT_FOUND'));

    const repo = await Repository.findOne({ _id: analysis.repositoryId, userId: req.session.userId });
    if (!repo) return next(createError('Access denied', 403, 'FORBIDDEN'));

    let fixPack = await FixPack.findOne({ analysisRunId: req.params.id });

    if (!fixPack) {
      const pr = await PullRequest.findById(analysis.pullRequestId);
      const findings = await Finding.find({ analysisRunId: req.params.id });

      if (pr && findings.length > 0) {
        const { generateFixPack } = await import('../reports/fixPackGenerator');
        const content = generateFixPack({ analysis, repository: repo, pullRequest: pr, findings });
        fixPack = await FixPack.create({
          analysisRunId: req.params.id,
          repositoryId: repo.id,
          content,
          version: 1,
          findingIds: findings.map(f => f.id)
        });
      }
    }

    if (!fixPack) {
      return next(createError('Fix pack not yet available', 404, 'NOT_FOUND'));
    }

    await AuditLog.create({
      userId: req.session.userId,
      action: 'FIX_PACK_VIEWED',
      resourceType: 'FixPack',
      resourceId: fixPack.id
    });

    res.json({ success: true, data: fixPack });
  } catch (err) {
    next(err);
  }
});

// Log fix pack copied
analysesRouter.post('/:id/fix-pack/copied', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await AuditLog.create({
      userId: req.session.userId,
      action: 'FIX_PACK_COPIED',
      resourceType: 'AnalysisRun',
      resourceId: req.params.id
    });
    res.json({ success: true, data: { recorded: true } });
  } catch (err) {
    next(err);
  }
});

// Trigger verification (new commit)
analysesRouter.post('/:id/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const analysis = await AnalysisRun.findById(req.params.id);
    if (!analysis) return next(createError('Analysis not found', 404, 'NOT_FOUND'));

    const repo = await Repository.findOne({ _id: analysis.repositoryId, userId: req.session.userId });
    if (!repo) return next(createError('Access denied', 403, 'FORBIDDEN'));

    const { newHeadSha } = req.body;

    const pr = await PullRequest.findById(analysis.pullRequestId);
    if (!pr) return next(createError('PR not found', 404, 'NOT_FOUND'));

    if (newHeadSha) {
      await PullRequest.findByIdAndUpdate(pr.id, { headSha: newHeadSha });
    }

    if (analysis.iterationNumber >= 3) {
      return next(createError('Maximum automatic verification iterations reached; manual review is required', 409, 'MANUAL_REVIEW_REQUIRED'));
    }

    const newAnalysis = await AnalysisRun.create({
      pullRequestId: pr.id,
      repositoryId: repo.id,
      iterationNumber: analysis.iterationNumber + 1,
      baseSha: analysis.baseSha,
      headSha: newHeadSha || pr.headSha,
      previousAnalysisId: analysis.id,
      status: 'RECEIVED',
      startedAt: new Date()
    });

    const isDemoRepo = repo.owner === 'demo-developer' || repo.githubRepoId.startsWith('demo-') || repo.owner === '';

    await dispatchLoopIteration(newAnalysis.id,
      isDemoRepo || !repo.githubRepoId || Number(repo.githubRepoId) > 999998000
        ? { demo: true, previousAnalysisId: analysis.id, pullRequestId: pr.id, repositoryId: repo.id }
        : { demo: false, previousAnalysisId: analysis.id });

    await AuditLog.create({
      userId: req.session.userId,
      action: 'VERIFICATION_STARTED',
      resourceType: 'AnalysisRun',
      resourceId: newAnalysis.id,
      metadata: { previousAnalysisId: analysis.id, iteration: newAnalysis.iterationNumber }
    });

    res.status(201).json({ success: true, data: newAnalysis });
  } catch (err) {
    next(err);
  }
});

// Get analysis history for a PR
analysesRouter.get('/:id/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const analysis = await AnalysisRun.findById(req.params.id);
    if (!analysis) return next(createError('Analysis not found', 404, 'NOT_FOUND'));

    const repo = await Repository.findOne({ _id: analysis.repositoryId, userId: req.session.userId });
    if (!repo) return next(createError('Access denied', 403, 'FORBIDDEN'));

    const history = await AnalysisRun.find({
      pullRequestId: analysis.pullRequestId
    }).sort({ createdAt: 1 });

    res.json({ success: true, data: history });
  } catch (err) {
    next(err);
  }
});

// Get all analyses for a user (dashboard)
analysesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = await Repository.find({ userId: req.session.userId });
    const repoIds = repos.map(r => r.id);

    const analyses = await AnalysisRun.find({ repositoryId: { $in: repoIds } })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({ success: true, data: analyses });
  } catch (err) {
    next(err);
  }
});
