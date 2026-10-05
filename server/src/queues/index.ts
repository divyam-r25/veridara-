import { Queue, Worker, Job } from 'bullmq';
import { getRedisClient } from '../config/redis';
import { runAnalysis } from '../services/analysisService';
import { logger } from '../utils/logger';

let analysisQueue: Queue | null = null;
let analysisWorker: Worker | null = null;
let webhookQueue: Queue | null = null;
let webhookWorker: Worker | null = null;
let verificationQueue: Queue | null = null;
let verificationWorker: Worker | null = null;

export async function initQueues(): Promise<void> {
  try {
    const connection = getRedisClient();

    analysisQueue = new Queue('analysis', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50
      }
    });

    analysisWorker = new Worker(
      'analysis',
      async (job: Job) => {
        const { analysisRunId } = job.data;
        logger.info(`Processing analysis job ${job.id} for run ${analysisRunId}`);
        await runAnalysis(analysisRunId);
      },
      {
        connection,
        concurrency: 3,
        limiter: { max: 10, duration: 60000 }
      }
    );

    webhookQueue = new Queue('webhook-events', { connection });
    webhookWorker = new Worker(
      'webhook-events',
      async (job: Job) => {
        const { processWebhookEvent } = await import('../routes/webhooks');
        await processWebhookEvent(job.data.webhookEventId, job.data.eventType, job.data.payload);
      },
      { connection, concurrency: 10 }
    );
    const { recoverPendingWebhookEvents } = await import('../routes/webhooks');
    await recoverPendingWebhookEvents();

    verificationQueue = new Queue('verification', { connection });
    verificationWorker = new Worker(
      'verification',
      async (job: Job) => {
        const { analysisRunId } = job.data;
        const { runVerification } = await import('../services/verification/verificationEngine');
        await runVerification(analysisRunId);
      },
      { connection, concurrency: 2 }
    );

    analysisWorker.on('completed', (job) => {
      logger.info(`Analysis job ${job.id} completed`);
    });

    analysisWorker.on('failed', (job, err) => {
      logger.error(`Analysis job ${job?.id} failed:`, err.message);
    });

    logger.info('✅ BullMQ queues initialized');
  } catch (err) {
    logger.warn('Redis unavailable; durable queue processing is disabled:', err instanceof Error ? err.message : String(err));
  }
}

export async function enqueueAnalysis(analysisRunId: string): Promise<void> {
  if (analysisQueue) {
    await analysisQueue.add('run-analysis', { analysisRunId }, {
      jobId: `analysis-${analysisRunId}`,
      attempts: 3
    });
    logger.info(`Analysis ${analysisRunId} enqueued`);
  } else if (process.env.NODE_ENV !== 'production') {
    // Local development convenience only. Production must never lose durable work.
    logger.info(`Running analysis ${analysisRunId} inline (no Redis)`);
    setTimeout(() => runAnalysis(analysisRunId).catch(err => {
      logger.error('Inline analysis failed:', err instanceof Error ? err.message : String(err));
    }), 100);
  } else throw new Error('Analysis queue is unavailable');
}

export function getAnalysisQueue(): Queue | null {
  return analysisQueue;
}

export async function enqueueWebhookEvent(webhookEventId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
  if (!webhookQueue) throw new Error('Webhook queue is unavailable');
  await webhookQueue.add('process-webhook', { webhookEventId, eventType, payload }, {
    jobId: `webhook-${webhookEventId}`,
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 500,
    removeOnFail: 500
  });
}

export async function enqueueVerification(analysisRunId: string): Promise<void> {
  if (!verificationQueue) throw new Error('Verification queue is unavailable');
  await verificationQueue.add('run-verification', { analysisRunId }, {
    jobId: `verification-${analysisRunId}`,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 100
  });
}
