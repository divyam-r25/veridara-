import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Activity, Shield, AlertTriangle, CheckCircle,
  Clock, TrendingUp, GitPullRequest, ArrowRight,
  RefreshCw, Zap
} from 'lucide-react';
import { AppLayout, PageHeader } from '../components/Layout';
import { ScoreRing, SeverityBadge, DecisionBadge, Skeleton, EmptyState } from '../components/ui';
import { getAllAnalyses, getRepositories } from '../services/api';
import type { AnalysisRun, Repository } from '../types';
import { formatDistanceToNow } from 'date-fns';

function StatCard({
  label, value, icon, sub, color = 'text-brand-400'
}: {
  label: string; value: string | number; icon: React.ReactNode; sub?: string; color?: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-[hsl(215,20%,50%)] uppercase tracking-wider">{label}</span>
        <span className={`${color} opacity-70`}>{icon}</span>
      </div>
      <div className={`text-2xl font-bold ${color} mb-1`}>{value}</div>
      {sub && <div className="text-xs text-[hsl(215,20%,45%)]">{sub}</div>}
    </div>
  );
}

function AnalysisCard({ analysis, repos }: { analysis: AnalysisRun; repos: Repository[] }) {
  const navigate = useNavigate();
  const repo = repos.find(r => r._id === analysis.repositoryId || r.id === analysis.repositoryId);

  const isComplete = ['AWAITING_FIX', 'RESOLVED', 'PARTIAL', 'REGRESSED', 'UNRESOLVED', 'COMPLETED'].includes(analysis.status);
  const isFailed = analysis.status === 'FAILED';
  const isRunning = !isComplete && !isFailed;

  return (
    <button
      onClick={() => navigate(`/analyses/${analysis._id}`)}
      className="card-hover p-4 text-left w-full transition-all animate-fade-in"
    >
      <div className="flex items-start gap-4">
        {isComplete ? (
          <ScoreRing score={analysis.releaseScore} size={52} />
        ) : (
          <div className="w-13 h-13 rounded-full bg-[hsl(222,35%,12%)] border-2 border-[hsl(222,30%,20%)] flex items-center justify-center flex-shrink-0" style={{ width: 52, height: 52 }}>
            {isFailed ? (
              <AlertTriangle size={20} className="text-red-400" />
            ) : (
              <RefreshCw size={18} className="text-brand-400 animate-spin-slow" />
            )}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-semibold text-[hsl(210,40%,92%)] truncate">
              {repo ? `${repo.owner}/${repo.name}` : 'Repository'}
            </span>
            {isComplete && <DecisionBadge decision={analysis.decision} />}
            {isRunning && (
              <span className="badge bg-brand-900/30 text-brand-400 border border-brand-500/30">
                <Zap size={10} className="animate-pulse" /> Analyzing
              </span>
            )}
            {isFailed && <span className="badge-critical">Failed</span>}
          </div>

          <div className="flex items-center gap-3 text-xs text-[hsl(215,20%,50%)]">
            <span className="flex items-center gap-1">
              <GitPullRequest size={11} />
              Iteration #{analysis.iterationNumber}
            </span>
            <span>{analysis.headSha?.substring(0, 7)}</span>
            <span>{formatDistanceToNow(new Date(analysis.createdAt), { addSuffix: true })}</span>
          </div>

          {isComplete && (
            <div className="flex items-center gap-4 mt-2">
              <span className="text-xs text-[hsl(215,20%,50%)]">
                Security: <span className="text-[hsl(210,40%,80%)] font-medium">{analysis.securityScore}</span>
              </span>
              <span className="text-xs text-[hsl(215,20%,50%)]">
                Changed: <span className="text-[hsl(210,40%,80%)] font-medium">{analysis.changedFiles} files</span>
              </span>
            </div>
          )}
        </div>

        <ArrowRight size={15} className="text-[hsl(215,20%,35%)] flex-shrink-0 mt-1" />
      </div>
    </button>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();

  const { data: analysesData, isLoading: loadingAnalyses } = useQuery({
    queryKey: ['analyses'],
    queryFn: getAllAnalyses,
    refetchInterval: 5000 // Poll for analysis updates
  });

  const { data: reposData, isLoading: loadingRepos } = useQuery({
    queryKey: ['repositories'],
    queryFn: getRepositories
  });

  const analyses = analysesData?.data || [];
  const repos = reposData?.data || [];

  const completedAnalyses = analyses.filter(a =>
    ['AWAITING_FIX', 'RESOLVED', 'PARTIAL', 'COMPLETED'].includes(a.status)
  );
  const latestAnalysis = completedAnalyses[0];
  const runningCount = analyses.filter(a => ['RECEIVED', 'TRIAGED', 'ANALYZING', 'CONTEXT_BUILT'].includes(a.status)).length;

  const avgScore = completedAnalyses.length > 0
    ? Math.round(completedAnalyses.reduce((s, a) => s + a.releaseScore, 0) / completedAnalyses.length)
    : 0;

  const criticalCount = 0; // Would count from findings
  const blockedCount = completedAnalyses.filter(a => a.decision === 'BLOCKED').length;

  return (
    <AppLayout>
      <PageHeader
        title="Dashboard"
        subtitle="Release readiness overview"
        actions={
          <button
            onClick={() => navigate('/repositories')}
            className="btn-primary"
          >
            <GitPullRequest size={15} />
            New Analysis
          </button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Avg Release Score"
            value={avgScore || '—'}
            icon={<TrendingUp size={18} />}
            sub={completedAnalyses.length > 0 ? `${completedAnalyses.length} analyses` : 'No analyses yet'}
            color={avgScore >= 80 ? 'text-emerald-400' : avgScore >= 60 ? 'text-amber-400' : 'text-red-400'}
          />
          <StatCard
            label="Repositories"
            value={repos.length}
            icon={<Activity size={18} />}
            sub="Connected"
            color="text-brand-400"
          />
          <StatCard
            label="Running"
            value={runningCount}
            icon={<RefreshCw size={18} className={runningCount > 0 ? 'animate-spin-slow' : ''} />}
            sub="Active analyses"
            color="text-blue-400"
          />
          <StatCard
            label="Blocked"
            value={blockedCount}
            icon={<AlertTriangle size={18} />}
            sub="Require attention"
            color={blockedCount > 0 ? 'text-red-400' : 'text-emerald-400'}
          />
        </div>

        {/* Latest analysis highlight */}
        {latestAnalysis && (
          <div className="card border border-[hsl(222,30%,22%)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[hsl(210,40%,90%)] text-sm">Latest Analysis</h2>
              <DecisionBadge decision={latestAnalysis.decision} />
            </div>

            <div className="flex items-center gap-8">
              <div className="flex items-center gap-6">
                <ScoreRing score={latestAnalysis.releaseScore} size={80} label="Release" />
                <ScoreRing score={latestAnalysis.securityScore} size={80} label="Security" />
                <ScoreRing score={latestAnalysis.verificationConfidence} size={80} label="Verified" />
              </div>

              <div className="flex-1 space-y-3">
                {latestAnalysis.hardGates.length > 0 && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-900/15 border border-red-500/20">
                    <AlertTriangle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-semibold text-red-400 mb-1">Hard Gates Active</div>
                      {latestAnalysis.hardGates.slice(0, 2).map((g, i) => (
                        <div key={i} className="text-xs text-[hsl(215,20%,55%)]">{g}</div>
                      ))}
                    </div>
                  </div>
                )}

                {latestAnalysis.executiveSummary && (
                  <p className="text-xs text-[hsl(215,20%,55%)] leading-relaxed line-clamp-3">
                    {latestAnalysis.executiveSummary.substring(0, 300)}
                  </p>
                )}

                <button
                  onClick={() => navigate(`/analyses/${latestAnalysis._id}`)}
                  className="btn-secondary text-xs"
                >
                  View Full Report <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Score breakdown */}
        {latestAnalysis?.scoreBreakdown && (
          <div className="card p-5">
            <h2 className="font-semibold text-[hsl(210,40%,90%)] text-sm mb-4">Score Breakdown</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {Object.entries(latestAnalysis.scoreBreakdown).map(([key, value]) => {
                const labels: Record<string, string> = {
                  changeRisk: 'Change Risk',
                  testReadiness: 'Test Ready',
                  apiCompatibility: 'API Compat.',
                  dependencySafety: 'Deps Safety',
                  securityScore: 'Security',
                  verificationConfidence: 'Verification'
                };
                return (
                  <div key={key} className="text-center">
                    <div className="text-lg font-bold text-[hsl(210,40%,92%)] mb-1">{value}</div>
                    <div className="text-xs text-[hsl(215,20%,45%)]">{labels[key] || key}</div>
                    <div className="mt-2 h-1 rounded-full bg-[hsl(222,30%,16%)]">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${value >= 80 ? 'bg-emerald-500' : value >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${value}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent analyses */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-[hsl(210,40%,90%)] text-sm">Recent Analyses</h2>
            <button
              onClick={() => navigate('/analyses')}
              className="text-xs text-[hsl(215,20%,50%)] hover:text-brand-400 transition-colors flex items-center gap-1"
            >
              View all <ArrowRight size={11} />
            </button>
          </div>

          {loadingAnalyses ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : analyses.length === 0 ? (
            <EmptyState
              icon={<Activity size={28} />}
              title="No analyses yet"
              description="Connect a repository and analyze a pull request to get started."
              action={
                <button onClick={() => navigate('/repositories')} className="btn-primary">
                  <GitPullRequest size={15} /> Connect Repository
                </button>
              }
            />
          ) : (
            <div className="space-y-2">
              {analyses.slice(0, 8).map(a => (
                <AnalysisCard key={a._id} analysis={a} repos={repos} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
