import { Router, Request, Response, NextFunction } from 'express';
import { validateWebhookSignature } from '../github/githubService';
import { WebhookEvent } from '../models/WebhookEvent';
import { Repository } from '../models/Repository';
import { PullRequest } from '../models/PullRequest';
import { AnalysisRun } from '../models/AnalysisRun';
import { enqueueAnalysis, enqueueWebhookEvent } from '../queues';
import { logger } from '../utils/logger';

export const webhooksRouter = Router();

// Webhook endpoint - must receive raw body for signature validation
webhooksRouter.post(
  '/github',
  // Raw body parser for signature validation
  (req, _res, next) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      (req as Request & { rawBody?: string }).rawBody = data;
      try {
        req.body = JSON.parse(data);
      } catch {
        req.body = {};
      }
      next();
    });
  },
  async (req: Request, res: Response, next: NextFunction) => {
    const deliveryId = req.headers['x-github-delivery'] as string;
    const eventType = req.headers['x-github-event'] as string;
    const signature = req.headers['x-hub-signature-256'] as string;
    const rawBody = (req as Request & { rawBody?: string }).rawBody || '';

    // Validate webhook signature
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (secret) {
      const valid = await validateWebhookSignature(rawBody, signature || '', secret);
      if (!valid) {
        logger.warn(`Invalid webhook signature for delivery ${deliveryId}`);
        return res.status(401).json({ success: false, error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' } });
      }
    }

    // Return quickly - process asynchronously
    res.status(202).json({ success: true, data: { received: true } });

    // Idempotency check - deduplicate events
    if (deliveryId) {
      const existing = await WebhookEvent.findOne({ deliveryId });
      if (existing && existing.processed) {
        logger.info(`Webhook ${deliveryId} already processed, skipping`);
        return;
      }
    }

    // Persist webhook event
    const payload = req.body as Record<string, unknown>;
    const repoFullName = (payload.repository as Record<string, string> | undefined)?.full_name;

    let webhookEvent;
    try {
      webhookEvent = await WebhookEvent.create({
        deliveryId: deliveryId || `manual-${Date.now()}`,
        eventType,
        repositoryFullName: repoFullName,
        payload,
        processed: false,
        receivedAt: new Date()
      });
    } catch (err) {
      // Unique constraint violation = duplicate
      logger.info(`Duplicate webhook delivery ${deliveryId}`);
      return;
    }

    await enqueueWebhookEvent(webhookEvent.id, eventType, payload);
  }
);

export async function processWebhookEvent(
  webhookEventId: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    if (eventType === 'push') {
      await handlePushEvent(payload);
    } else if (eventType === 'pull_request') {
      await handlePullRequestEvent(payload);
    }

    await WebhookEvent.findByIdAndUpdate(webhookEventId, {
      processed: true,
      processedAt: new Date()
    });
  } catch (err) {
    await WebhookEvent.findByIdAndUpdate(webhookEventId, {
      processingError: err instanceof Error ? err.message : String(err)
    });
  }
}

async function handlePushEvent(payload: Record<string, unknown>): Promise<void> {
  const repo = payload.repository as Record<string, unknown> | undefined;
  if (!repo) return;

  const repoFullName = repo.full_name as string;
  const headSha = payload.after as string;
  const ref = payload.ref as string;

  logger.info(`Push event: ${repoFullName} @ ${headSha}`);

  // Find repository in our system
  const dbRepo = await Repository.findOne({ fullName: repoFullName });
  if (!dbRepo) return;

  // Find open PRs for this repo that might be affected
  const openPRs = await PullRequest.find({
    repositoryId: dbRepo.id,
    state: 'open',
    headSha: { $ne: headSha }
  });

  for (const pr of openPRs) {
    // Check if this push is on the PR's head branch
    const branch = ref.replace('refs/heads/', '');
    if (branch === pr.headBranch) {
      // Update PR head SHA
      await PullRequest.findByIdAndUpdate(pr.id, { headSha });

      // Find the latest analysis for this PR
      const latestAnalysis = await AnalysisRun.findOne(
        { pullRequestId: pr.id },
        {},
        { sort: { createdAt: -1 } }
      );

      if (latestAnalysis && latestAnalysis.status === 'AWAITING_FIX') {
        // Trigger re-analysis
        const newRun = await AnalysisRun.create({
          pullRequestId: pr.id,
          repositoryId: dbRepo.id,
          iterationNumber: latestAnalysis.iterationNumber + 1,
          baseSha: pr.baseSha,
          headSha,
          previousAnalysisId: latestAnalysis.id,
          status: 'RECEIVED',
          startedAt: new Date()
        });

        await enqueueAnalysis(newRun.id);
        logger.info(`Auto-triggered re-analysis ${newRun.id} for PR #${pr.githubPrNumber}`);
      }
    }
  }
}

async function handlePullRequestEvent(payload: Record<string, unknown>): Promise<void> {
  const action = payload.action as string;
  const prData = payload.pull_request as Record<string, unknown> | undefined;
  const repo = payload.repository as Record<string, unknown> | undefined;

  if (!prData || !repo) return;

  logger.info(`PR event: ${action} for ${repo.full_name} #${prData.number}`);

  // We log but don't auto-analyze - user must explicitly trigger analysis
}
