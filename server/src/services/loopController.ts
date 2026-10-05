import { enqueueAnalysis } from '../queues';
import { logger } from '../utils/logger';

/**
 * Coordinates the Analyze → Fix → Verify → Re-analyze loop.
 *
 * Production iterations are delegated to BullMQ workers. Demo iterations stay
 * local but use the same persisted AnalysisRun lifecycle as production.
 */
export async function dispatchLoopIteration(
  analysisRunId: string,
  options:
    | { demo: false }
    | { demo: true; pullRequestId: string; repositoryId: string; previousAnalysisId?: string }
    = { demo: false }
): Promise<void> {
  if (!options.demo) {
    await enqueueAnalysis(analysisRunId);
    return;
  }

  if (options.previousAnalysisId) {
    const { runDemoVerification } = await import('../demo/demoAnalysis');
    setTimeout(() => {
      runDemoVerification(analysisRunId, options.previousAnalysisId!, options.pullRequestId, options.repositoryId)
        .catch((error) => logger.error('Demo verification failed:', error));
    }, 200);
    return;
  }

  const { runDemoAnalysis } = await import('../demo/demoAnalysis');
  setTimeout(() => {
    runDemoAnalysis(analysisRunId, options.pullRequestId, options.repositoryId)
      .catch((error) => logger.error('Demo analysis failed:', error));
  }, 200);
}
