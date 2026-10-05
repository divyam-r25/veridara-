import React, { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield, AlertTriangle, CheckCircle, Copy, Download,
  RefreshCw, ChevronDown, ChevronUp, FileCode, ExternalLink,
  AlertCircle, Info, Cpu, Package, Activity, GitCompare,
  Zap, ArrowRight, Play, Clock
} from 'lucide-react';
import { AppLayout, PageHeader } from '../components/Layout';
import {
  ScoreRing, SeverityBadge, DecisionBadge, CategoryBadge,
  FindingStatusBadge, Skeleton, EmptyState, Toast, ProgressBar, Spinner
} from '../components/ui';
import {
  getAnalysis, getFindings, getFixPack, triggerVerification,
  recordFixPackCopied, getAnalysisHistory
} from '../services/api';
import type { AnalysisRun, Finding, FixPack, AnalysisStatus } from '../types';
import { formatDistanceToNow, format } from 'date-fns';

// ============ Analysis Progress ============
const PROGRESS_STEPS = [
  { key: 'fetchingPR', label: 'Fetching PR from GitHub' },
  { key: 'buildingContext', label: 'Building repository context' },
  { key: 'runningChecks', label: 'Running security & static checks' },
  { key: 'aiReasoning', label: 'AI reasoning & analysis' },
  { key: 'calculatingScore', label: 'Calculating release score' },
  { key: 'generatingReport', label: 'Generating report & Fix Pack' },
];

function AnalysisProgress({ analysis }: { analysis: AnalysisRun }) {
  const progress = analysis.analysisProgress || {};
  const isComplete = ['AWAITING_FIX', 'RESOLVED', 'COMPLETED'].includes(analysis.status);
  const isFailed = analysis.status === 'FAILED';

  return (
    <div className="card p-6 animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-full bg-brand-600/20 border border-brand-500/30 flex items-center justify-center">
          <Zap size={16} className="text-brand-400 animate-pulse" />
        </div>
        <div>
          <h2 className="font-semibold text-[hsl(210,40%,92%)]">
            {isFailed ? 'Analysis Failed' : isComplete ? 'Analysis Complete' : 'Analyzing...'}
          </h2>
          <p className="text-xs text-[hsl(215,20%,50%)]">
            {isFailed ? 'An error occurred during analysis' : isComplete ? 'All checks completed' : 'Running checks in the background'}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {PROGRESS_STEPS.map(step => {
          const status = progress[step.key];
          const isDone = status === 'DONE' || isComplete;
          const isRunning = status === 'IN_PROGRESS' && !isComplete;

          return (
            <div key={step.key} className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                isDone ? 'bg-emerald-500/20 border border-emerald-500/40' :
                isRunning ? 'bg-brand-600/20 border border-brand-500/40' :
                'bg-[hsl(222,35%,14%)] border border-[hsl(222,30%,20%)]'
              }`}>
                {isDone ? (
                  <CheckCircle size={11} className="text-emerald-400" />
                ) : isRunning ? (
                  <RefreshCw size={10} className="text-brand-400 animate-spin" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-[hsl(222,30%,30%)]" />
                )}
              </div>
              <span className={`text-sm ${isDone ? 'text-[hsl(210,40%,80%)]' : isRunning ? 'text-brand-300' : 'text-[hsl(215,20%,40%)]'}`}>
                {step.label}
              </span>
              {isRunning && <Spinner size={12} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============ Finding Card ============
function FindingCard({ finding }: { finding: Finding }) {
  const [expanded, setExpanded] = useState(false);

  const isAI = finding.detectionMethod === 'AI_ASSESSMENT';

  return (
    <div className="card border border-[hsl(222,30%,20%)] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left hover:bg-[hsl(222,35%,10%)] transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <SeverityBadge severity={finding.severity} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 mb-1.5">
              <span className="font-semibold text-[hsl(210,40%,92%)] text-sm leading-tight">{finding.title}</span>
              {isAI && (
                <span className="badge bg-violet-500/10 text-violet-400 border-violet-500/20 flex-shrink-0 text-xs">
                  <Cpu size={9} /> AI Assessment
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CategoryBadge category={finding.category} />
              <FindingStatusBadge status={finding.status} />
              <span className="text-xs text-[hsl(215,20%,45%)]">
                {Math.round(finding.confidence * 100)}% confidence
              </span>
            </div>
            {finding.affectedFiles.length > 0 && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[hsl(215,20%,45%)]">
                <FileCode size={11} />
                <span className="truncate">{finding.affectedFiles.slice(0, 2).join(', ')}</span>
                {finding.affectedFiles.length > 2 && <span>+{finding.affectedFiles.length - 2}</span>}
              </div>
            )}
          </div>
          {expanded ? <ChevronUp size={16} className="text-[hsl(215,20%,40%)] flex-shrink-0" /> : <ChevronDown size={16} className="text-[hsl(215,20%,40%)] flex-shrink-0" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[hsl(222,30%,18%)] p-4 space-y-4 animate-fade-in">
          <div>
            <div className="text-xs font-semibold text-[hsl(215,20%,50%)] uppercase tracking-wider mb-1.5">Summary</div>
            <p className="text-sm text-[hsl(215,20%,70%)] leading-relaxed">{finding.summary}</p>
          </div>

          {finding.evidence.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-[hsl(215,20%,50%)] uppercase tracking-wider mb-2">Evidence</div>
              <div className="space-y-2">
                {finding.evidence.map((e, i) => (
                  <div key={i} className="rounded-lg bg-[hsl(222,50%,5%)] border border-[hsl(222,30%,16%)] p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <FileCode size={12} className="text-brand-400" />
                      <code className="text-xs text-brand-300 font-mono">
                        {e.file}{e.startLine ? `:${e.startLine}${e.endLine !== e.startLine ? `-${e.endLine}` : ''}` : ''}
                      </code>
                    </div>
                    <p className="text-xs text-[hsl(215,20%,60%)]">{e.description}</p>
                    {e.snippet && (
                      <pre className="mt-2 text-xs text-[hsl(210,40%,75%)] font-mono overflow-x-auto bg-[hsl(222,50%,3%)] rounded p-2 border border-[hsl(222,30%,14%)]">
                        {e.snippet}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-semibold text-[hsl(215,20%,50%)] uppercase tracking-wider mb-1.5">Impact</div>
            <p className="text-sm text-[hsl(215,20%,65%)] leading-relaxed">{finding.impact}</p>
          </div>

          <div>
            <div className="text-xs font-semibold text-[hsl(215,20%,50%)] uppercase tracking-wider mb-1.5">Recommended Fix</div>
            <p className="text-sm text-[hsl(215,20%,65%)] leading-relaxed">{finding.recommendation}</p>
          </div>

          {finding.suggestedTests.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-[hsl(215,20%,50%)] uppercase tracking-wider mb-1.5">Suggested Tests</div>
              <ul className="space-y-1">
                {finding.suggestedTests.map((t, i) => (
                  <li key={i} className="text-xs text-[hsl(215,20%,60%)] flex items-start gap-2">
                    <span className="text-brand-400 mt-0.5">›</span>{t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1 text-xs text-[hsl(215,20%,40%)]">
            <span>Detected by: {finding.detectionMethod.replace(/_/g, ' ')}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ Fix Pack Tab ============
function FixPackTab({ analysisId }: { analysisId: string }) {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['fixpack', analysisId],
    queryFn: () => getFixPack(analysisId)
  });

  const fixPack = data?.data;

  const handleCopy = async () => {
    if (!fixPack) return;
    try {
      await navigator.clipboard.writeText(fixPack.content);
      recordFixPackCopied(analysisId).catch(() => {});
      setToast({ message: '✓ Fix Pack copied to clipboard', type: 'success' });
    } catch {
      setToast({ message: 'Failed to copy', type: 'error' });
    }
  };

  const handleDownload = () => {
    if (!fixPack) return;
    const blob = new Blob([fixPack.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fix-pack-${analysisId.substring(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <div className="p-6"><Skeleton className="h-64 rounded-xl" /></div>;

  if (error || !fixPack) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Zap size={28} />}
          title="Fix Pack not ready"
          description="The Fix Pack will be generated once analysis completes."
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-[hsl(210,40%,92%)]">AI Fix Pack</h2>
          <p className="text-xs text-[hsl(215,20%,50%)] mt-0.5">
            Copy this prompt into any AI coding agent to fix identified issues
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDownload} className="btn-secondary text-xs">
            <Download size={13} /> Download .md
          </button>
          <button onClick={handleCopy} className="btn-primary text-xs">
            <Copy size={13} /> Copy Fix Pack
          </button>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-brand-900/15 border border-brand-700/30 text-xs text-brand-300 flex items-start gap-2">
        <Info size={14} className="flex-shrink-0 mt-0.5" />
        <span>Paste this Fix Pack into ChatGPT, Claude, Cursor, or any AI coding assistant. The agent will have full context to address the identified findings.</span>
      </div>

      <div className="code-block max-h-[600px] overflow-y-auto scrollbar-thin whitespace-pre-wrap leading-relaxed">
        {fixPack.content}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ============ Loop Timeline ============
function LoopTimeline({ analyses }: { analyses: AnalysisRun[] }) {
  const navigate = useNavigate();

  if (analyses.length <= 1) return null;

  return (
    <div className="p-6">
      <h2 className="font-semibold text-[hsl(210,40%,92%)] text-sm mb-4">Loop Timeline</h2>
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-px bg-[hsl(222,30%,18%)]" />
        <div className="space-y-4">
          {analyses.map((a, i) => {
            const isComplete = ['AWAITING_FIX', 'RESOLVED', 'COMPLETED'].includes(a.status);
            return (
              <div key={a._id} className="relative flex items-start gap-4 pl-10">
                <div className={`absolute left-2.5 w-3 h-3 rounded-full border-2 -translate-x-1/2 mt-1 ${
                  isComplete ? 'bg-emerald-500 border-emerald-400' :
                  a.status === 'FAILED' ? 'bg-red-500 border-red-400' :
                  'bg-brand-500 border-brand-400 animate-pulse'
                }`} />

                <button
                  onClick={() => navigate(`/analyses/${a._id}`)}
                  className="flex-1 card p-3 text-left hover:bg-[hsl(222,35%,11%)] transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-semibold text-[hsl(210,40%,85%)]">
                        Iteration #{a.iterationNumber}
                        {i === 0 && ' (Initial)'}
                        {i > 0 && ' (Re-analysis)'}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {isComplete && (
                          <span className="text-lg font-bold text-[hsl(210,40%,92%)]">{a.releaseScore}</span>
                        )}
                        <DecisionBadge decision={a.decision} />
                      </div>
                    </div>
                    <div className="text-xs text-[hsl(215,20%,40%)]">
                      {format(new Date(a.createdAt), 'MMM d, HH:mm')}
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Before/After comparison */}
      {analyses.length >= 2 && analyses[0].releaseScore > 0 && (
        <div className="mt-6 card p-4">
          <h3 className="text-xs font-semibold text-[hsl(215,20%,50%)] uppercase tracking-wider mb-3">
            Before → After
          </h3>
          {(() => {
            const first = analyses[0];
            const last = analyses[analyses.length - 1];
            const diff = last.releaseScore - first.releaseScore;
            return (
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-[hsl(210,40%,75%)]">{first.releaseScore}</div>
                  <div className="text-xs text-[hsl(215,20%,45%)]">Initial Score</div>
                </div>
                <div className="flex items-center justify-center">
                  <div className={`text-xl font-bold ${diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {diff >= 0 ? '+' : ''}{diff}
                  </div>
                </div>
                <div>
                  <div className={`text-2xl font-bold ${last.releaseScore >= 80 ? 'text-emerald-400' : last.releaseScore >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                    {last.releaseScore}
                  </div>
                  <div className="text-xs text-[hsl(215,20%,45%)]">Current Score</div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ============ Main Analysis Page ============
export function AnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'findings' | 'security' | 'fixpack' | 'verification' | 'timeline'>('overview');
  const [verifying, setVerifying] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data: analysisData, isLoading } = useQuery({
    queryKey: ['analysis', id],
    queryFn: () => getAnalysis(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      const terminal = ['AWAITING_FIX', 'RESOLVED', 'PARTIAL', 'COMPLETED', 'FAILED'];
      return terminal.includes(status || '') ? false : 3000;
    }
  });

  const { data: findingsData } = useQuery({
    queryKey: ['findings', id],
    queryFn: () => getFindings(id!),
    enabled: !!id && !!analysisData?.data?.completedAt
  });

  const { data: historyData } = useQuery({
    queryKey: ['analysis-history', id],
    queryFn: () => getAnalysisHistory(id!),
    enabled: !!id
  });

  const analysis = analysisData?.data;
  const findings = findingsData?.data || [];
  const history = historyData?.data || [];

  const isComplete = analysis && ['AWAITING_FIX', 'RESOLVED', 'PARTIAL', 'COMPLETED'].includes(analysis.status);
  const isRunning = analysis && !isComplete && analysis.status !== 'FAILED';

  const criticalFindings = findings.filter(f => f.severity === 'CRITICAL' && f.status === 'OPEN');
  const highFindings = findings.filter(f => f.severity === 'HIGH' && f.status === 'OPEN');
  const securityFindings = findings.filter(f => f.category === 'SECURITY');

  const handleVerify = async () => {
    if (!analysis) return;
    setVerifying(true);
    try {
      const result = await triggerVerification(analysis._id);
      navigate(`/analyses/${result.data._id}`);
    } catch {
      setToast({ message: 'Failed to trigger verification', type: 'error' });
    } finally {
      setVerifying(false);
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 space-y-4">
          <Skeleton className="h-12 rounded-lg w-72" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!analysis) {
    return (
      <AppLayout>
        <div className="p-6">
          <EmptyState
            icon={<Activity size={28} />}
            title="Analysis not found"
            description="This analysis may have been removed or you don't have access."
            action={<button onClick={() => navigate('/analyses')} className="btn-secondary">Back to Analyses</button>}
          />
        </div>
      </AppLayout>
    );
  }

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'findings', label: `Findings ${findings.length > 0 ? `(${findings.length})` : ''}` },
    { key: 'security', label: `Security ${securityFindings.length > 0 ? `(${securityFindings.length})` : ''}` },
    { key: 'fixpack', label: 'AI Fix Pack' },
    { key: 'verification', label: 'Verification' },
    { key: 'timeline', label: 'Loop Timeline' },
  ];

  return (
    <AppLayout>
      <PageHeader
        title={`Analysis #${analysis.iterationNumber}`}
        subtitle={`${analysis.headSha?.substring(0, 8)} · ${formatDistanceToNow(new Date(analysis.createdAt), { addSuffix: true })}`}
        breadcrumbs={[
          { label: 'Analyses', to: '/analyses' },
          { label: `Iteration #${analysis.iterationNumber}` }
        ]}
        actions={
          isComplete ? (
            <button
              onClick={handleVerify}
              disabled={verifying}
              className="btn-primary text-sm"
            >
              {verifying ? <Spinner size={14} /> : <RefreshCw size={14} />}
              Simulate Fix & Verify
            </button>
          ) : null
        }
      />

      {/* Status/running indicator */}
      {isRunning && (
        <div className="px-6 pt-6">
          <AnalysisProgress analysis={analysis} />
        </div>
      )}

      {/* Scores header */}
      {isComplete && (
        <div className="px-6 py-5 border-b border-[hsl(222,30%,18%)]">
          <div className="flex items-center gap-8 flex-wrap">
            <ScoreRing score={analysis.releaseScore} size={90} label="Release Score" />
            <ScoreRing score={analysis.securityScore} size={90} label="Security Score" />
            <ScoreRing score={analysis.verificationConfidence} size={90} label="Verified" />

            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <DecisionBadge decision={analysis.decision} />
                {analysis.hardGates.length > 0 && (
                  <span className="badge-critical">
                    <AlertTriangle size={10} /> {analysis.hardGates.length} Hard Gate{analysis.hardGates.length > 1 ? 's' : ''}
                  </span>
                )}
                {!analysis.aiAvailable && (
                  <span className="badge-info text-xs">Deterministic Only</span>
                )}
              </div>

              {analysis.executiveSummary && (
                <p className="text-sm text-[hsl(215,20%,60%)] leading-relaxed max-w-xl">
                  {analysis.executiveSummary.substring(0, 250)}
                  {analysis.executiveSummary.length > 250 && '...'}
                </p>
              )}

              {/* Hard gates */}
              {analysis.hardGates.map((gate, i) => (
                <div key={i} className="mt-2 flex items-center gap-2 text-xs text-red-400">
                  <AlertTriangle size={11} /> {gate}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      {isComplete && (
        <>
          <div className="px-6 border-b border-[hsl(222,30%,18%)] flex overflow-x-auto scrollbar-thin">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={activeTab === tab.key ? 'tab-active' : 'tab'}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="animate-fade-in">
            {/* Overview */}
            {activeTab === 'overview' && (
              <div className="p-6 space-y-6">
                {/* Score breakdown */}
                <div className="card p-5">
                  <h2 className="font-semibold text-[hsl(210,40%,90%)] text-sm mb-4">Score Breakdown</h2>
                  <div className="space-y-3">
                    {[
                      { key: 'changeRisk', label: 'Change Risk', weight: '20%' },
                      { key: 'testReadiness', label: 'Test Readiness', weight: '20%' },
                      { key: 'apiCompatibility', label: 'API Compatibility', weight: '15%' },
                      { key: 'dependencySafety', label: 'Dependency Safety', weight: '10%' },
                      { key: 'securityScore', label: 'Security', weight: '25%' },
                      { key: 'verificationConfidence', label: 'Verification', weight: '10%' },
                    ].map(({ key, label, weight }) => {
                      const value = (analysis.scoreBreakdown as Record<string, number>)[key] || 0;
                      return (
                        <div key={key} className="flex items-center gap-3">
                          <div className="w-36 text-xs text-[hsl(215,20%,55%)]">{label}</div>
                          <div className="flex-1">
                            <ProgressBar value={value} />
                          </div>
                          <div className="w-8 text-xs font-medium text-[hsl(210,40%,85%)] text-right">{value}</div>
                          <div className="w-8 text-xs text-[hsl(215,20%,40%)]">{weight}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Critical/high finding summary */}
                {(criticalFindings.length > 0 || highFindings.length > 0) && (
                  <div className="space-y-2">
                    <h2 className="font-semibold text-[hsl(210,40%,90%)] text-sm">Top Issues</h2>
                    {[...criticalFindings, ...highFindings].slice(0, 3).map(f => (
                      <FindingCard key={f._id} finding={f} />
                    ))}
                    {findings.length > 3 && (
                      <button
                        onClick={() => setActiveTab('findings')}
                        className="btn-ghost text-xs"
                      >
                        View all {findings.length} findings <ArrowRight size={12} />
                      </button>
                    )}
                  </div>
                )}

                {criticalFindings.length === 0 && highFindings.length === 0 && findings.length === 0 && (
                  <div className="card p-6 text-center">
                    <CheckCircle size={28} className="text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm text-[hsl(210,40%,80%)] font-medium">No open critical or high findings</p>
                    <p className="text-xs text-[hsl(215,20%,45%)] mt-1">The change appears to have a clean profile</p>
                  </div>
                )}

                {/* AI Summary */}
                {analysis.aiSummary && (
                  <div className="card p-4">
                    <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-[hsl(215,20%,50%)] uppercase tracking-wider">
                      <Cpu size={12} /> AI Analysis
                    </div>
                    <p className="text-sm text-[hsl(215,20%,65%)] leading-relaxed">{analysis.aiSummary}</p>
                  </div>
                )}
              </div>
            )}

            {/* Findings */}
            {activeTab === 'findings' && (
              <div className="p-6 space-y-2">
                {findings.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle size={28} />}
                    title="No findings"
                    description="No issues were detected in this analysis."
                  />
                ) : (
                  <>
                    <div className="flex items-center gap-3 mb-4 text-xs text-[hsl(215,20%,50%)]">
                      <span>Critical: <span className="text-red-400 font-semibold">{findings.filter(f => f.severity === 'CRITICAL').length}</span></span>
                      <span>High: <span className="text-orange-400 font-semibold">{findings.filter(f => f.severity === 'HIGH').length}</span></span>
                      <span>Medium: <span className="text-amber-400 font-semibold">{findings.filter(f => f.severity === 'MEDIUM').length}</span></span>
                      <span>Low: <span className="text-blue-400 font-semibold">{findings.filter(f => f.severity === 'LOW').length}</span></span>
                    </div>
                    {findings.map(f => <FindingCard key={f._id} finding={f} />)}
                  </>
                )}
              </div>
            )}

            {/* Security */}
            {activeTab === 'security' && (
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Security Score', value: analysis.securityScore, color: 'text-red-400' },
                    { label: 'Secrets', value: findings.filter(f => f.title?.toLowerCase().includes('secret') || f.title?.toLowerCase().includes('credential')).length, color: 'text-orange-400' },
                    { label: 'Injection Risks', value: findings.filter(f => f.title?.toLowerCase().includes('injection') || f.title?.toLowerCase().includes('xss')).length, color: 'text-amber-400' },
                    { label: 'AI Context', value: findings.filter(f => f.category === 'AI_CONTEXT').length, color: 'text-violet-400' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="card p-4 text-center">
                      <div className={`text-2xl font-bold ${color} mb-1`}>{value}</div>
                      <div className="text-xs text-[hsl(215,20%,45%)]">{label}</div>
                    </div>
                  ))}
                </div>

                <h2 className="font-semibold text-[hsl(210,40%,90%)] text-sm">Security Findings</h2>
                {securityFindings.length === 0 ? (
                  <div className="card p-6 text-center">
                    <Shield size={28} className="text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm text-[hsl(210,40%,80%)]">No security issues detected</p>
                  </div>
                ) : (
                  securityFindings.map(f => <FindingCard key={f._id} finding={f} />)
                )}
              </div>
            )}

            {/* Fix Pack */}
            {activeTab === 'fixpack' && <FixPackTab analysisId={analysis._id} />}

            {/* Verification */}
            {activeTab === 'verification' && (
              <div className="p-6 space-y-4">
                <div className="card p-5">
                  <h2 className="font-semibold text-[hsl(210,40%,90%)] text-sm mb-3">Verification Status</h2>
                  <div className="text-sm text-[hsl(215,20%,60%)]">
                    <p>Verification Confidence: <span className="font-semibold text-[hsl(210,40%,90%)]">{analysis.verificationConfidence}%</span></p>
                    <p className="mt-2 leading-relaxed">
                      {analysis.verificationConfidence === 0
                        ? 'This analysis has not been verified yet. Apply the AI Fix Pack and trigger a new commit to start the verification loop.'
                        : `This analysis has been verified with ${analysis.verificationConfidence}% confidence.`
                      }
                    </p>
                  </div>
                </div>

                {analysis.status === 'AWAITING_FIX' && (
                  <div className="card p-5 border border-brand-500/20">
                    <h3 className="font-semibold text-[hsl(210,40%,90%)] text-sm mb-2">Ready for Verification</h3>
                    <p className="text-xs text-[hsl(215,20%,55%)] mb-4">
                      Apply the Fix Pack using an AI coding agent, push a new commit, then trigger verification to see if the issues were resolved.
                    </p>
                    <button onClick={handleVerify} disabled={verifying} className="btn-primary">
                      {verifying ? <Spinner size={14} /> : <RefreshCw size={14} />}
                      Simulate Fix & Verify (Demo)
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Timeline */}
            {activeTab === 'timeline' && (
              history.length > 1
                ? <LoopTimeline analyses={history} />
                : (
                  <div className="p-6">
                    <EmptyState
                      icon={<RefreshCw size={28} />}
                      title="No loop iterations yet"
                      description="Trigger a verification after applying the Fix Pack to see the loop timeline."
                    />
                  </div>
                )
            )}
          </div>
        </>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </AppLayout>
  );
}
