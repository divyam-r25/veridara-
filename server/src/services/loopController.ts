import { enqueueAnalysis } from '../queues';
import { logger } from '../utils/logger';
import { AnalysisRun, AnalysisStatus } from '../models/AnalysisRun';

const TRANSITIONS: Record<AnalysisStatus, AnalysisStatus[]> = {
  RECEIVED: ['TRIAGED', 'FAILED'],
  TRIAGED: ['CONTEXT_BUILT', 'FAILED'],
  CONTEXT_BUILT: ['ANALYZING', 'FAILED'],
  ANALYZING: ['FINDINGS_READY', 'PARTIAL', 'FAILED'],
  FINDINGS_READY: ['FIX_PLAN_READY', 'PARTIAL', 'FAILED'],
  FIX_PLAN_READY: ['AWAITING_FIX', 'FAILED'],
  AWAITING_FIX: ['REANALYZING', 'FAILED'],
  REANALYZING: ['VERIFYING', 'PARTIAL', 'FAILED'],
  VERIFYING: ['RESOLVED', 'PARTIAL', 'REGRESSED', 'UNRESOLVED', 'FAILED'],
  RESOLVED: [], PARTIAL: [], REGRESSED: [], UNRESOLVED: [], COMPLETED: [], FAILED: [], PARTIALLY_COMPLETED: []
};

export function canTransition(from: AnalysisStatus, to: AnalysisStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export async function transitionAnalysisRun(id: string, to: AnalysisStatus, patch: Record<string, unknown> = {}): Promise<void> {
  const run = await AnalysisRun.findById(id).select('status');
  if (!run) throw new Error(`Analysis run ${id} not found`);
  if (!canTransition(run.status, to)) throw new Error(`Invalid analysis transition: ${run.status} -> ${to}`);
  await AnalysisRun.findByIdAndUpdate(id, { ...patch, status: to });
}

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
