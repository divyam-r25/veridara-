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
    const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
    if (!deliveryId || !eventType) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_WEBHOOK', message: 'Missing GitHub delivery metadata' } });
    }
    if (!secret && process.env.NODE_ENV === 'production') {
      return res.status(503).json({ success: false, error: { code: 'WEBHOOK_NOT_CONFIGURED', message: 'Webhook verification is not configured' } });
    }
    if (secret) {
      const valid = await validateWebhookSignature(rawBody, signature || '', secret);
      if (!valid) {
        logger.warn(`Invalid webhook signature for delivery ${deliveryId}`);
        return res.status(401).json({ success: false, error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' } });
      }
    }

    // A unique delivery id is the durable idempotency boundary. Do not report
    // success until the event has been stored and a queue job was accepted.
    const existing = await WebhookEvent.findOne({ deliveryId });
    if (existing) {
      logger.info(`Duplicate webhook delivery ${deliveryId}`);
      return res.status(202).json({ success: true, data: { received: true, duplicate: true } });
    }

    // Persist webhook event
    const payload = req.body as Record<string, unknown>;
    const repoFullName = (payload.repository as Record<string, string> | undefined)?.full_name;

    let webhookEvent;
    try {
      webhookEvent = await WebhookEvent.create({
        deliveryId,
        eventType,
        repositoryFullName: repoFullName,
        payload,
        processed: false,
        receivedAt: new Date()
      });
    } catch (err) {
      if (typeof err === 'object' && err && 'code' in err && (err as { code?: number }).code === 11000) {
        return res.status(202).json({ success: true, data: { received: true, duplicate: true } });
      }
      throw err;
    }

    try {
      await enqueueWebhookEvent(webhookEvent.id, eventType, payload);
    } catch (error) {
      await WebhookEvent.findByIdAndUpdate(webhookEvent.id, {
        processingError: `Queue enqueue failed: ${error instanceof Error ? error.message : String(error)}`
      });
      return res.status(503).json({ success: false, error: { code: 'WEBHOOK_QUEUE_UNAVAILABLE', message: 'Webhook was stored but could not be queued; it will be recovered.' } });
    }

    return res.status(202).json({ success: true, data: { received: true } });
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
    throw err;
  }
}

/** Re-enqueue persisted events after a transient queue outage or restart. */
export async function recoverPendingWebhookEvents(): Promise<void> {
  const pending = await WebhookEvent.find({ processed: false }).sort({ receivedAt: 1 }).limit(100);
  for (const event of pending) {
    await enqueueWebhookEvent(event.id, event.eventType, event.payload);
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
