import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Activity, RefreshCw, ArrowRight, AlertTriangle } from 'lucide-react';
import { AppLayout, PageHeader } from '../components/Layout';
import { DecisionBadge, ScoreRing, Skeleton, EmptyState } from '../components/ui';
import { getAllAnalyses, getRepositories } from '../services/api';
import type { AnalysisRun, Repository } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../hooks/useAuth';

export function AnalysesListPage() {
  const navigate = useNavigate();

  const { data: analysesData, isLoading } = useQuery({
    queryKey: ['analyses'],
    queryFn: getAllAnalyses,
    refetchInterval: 5000
  });

  const { data: reposData } = useQuery({
    queryKey: ['repositories'],
    queryFn: getRepositories
  });

  const analyses = analysesData?.data || [];
  const repos = reposData?.data || [];

  const getRepo = (repoId: string) => repos.find(r => r._id === repoId || r.id === repoId);

  return (
    <AppLayout>
      <PageHeader
        title="Analyses"
        subtitle="All analysis runs across repositories"
      />

      <div className="p-6">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : analyses.length === 0 ? (
          <EmptyState
            icon={<Activity size={28} />}
            title="No analyses yet"
            description="Start by connecting a repository and analyzing a pull request."
            action={
              <button onClick={() => navigate('/repositories')} className="btn-primary">
                Get Started
              </button>
            }
          />
        ) : (
          <div className="space-y-2">
            {analyses.map((a: AnalysisRun) => {
              const repo = getRepo(a.repositoryId);
              const isComplete = ['AWAITING_FIX', 'RESOLVED', 'PARTIAL', 'COMPLETED'].includes(a.status);
              const isRunning = !isComplete && a.status !== 'FAILED';

              return (
                <button
                  key={a._id}
                  onClick={() => navigate(`/analyses/${a._id}`)}
                  className="card-hover p-4 text-left w-full"
                >
                  <div className="flex items-center gap-4">
                    {isComplete ? (
                      <ScoreRing score={a.releaseScore} size={50} />
                    ) : (
                      <div className="w-[50px] h-[50px] rounded-full bg-[hsl(222,35%,12%)] border-2 border-[hsl(222,30%,20%)] flex items-center justify-center">
                        {a.status === 'FAILED'
                          ? <AlertTriangle size={18} className="text-red-400" />
                          : <RefreshCw size={16} className="text-brand-400 animate-spin-slow" />
                        }
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm text-[hsl(210,40%,92%)] truncate">
                          {repo ? repo.fullName : 'Unknown Repository'}
                        </span>
                        {isComplete && <DecisionBadge decision={a.decision} />}
                        {isRunning && (
                          <span className="badge bg-brand-900/30 text-brand-400 border border-brand-500/30 text-xs">
                            Analyzing
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-[hsl(215,20%,45%)]">
                        <span>Iteration #{a.iterationNumber}</span>
                        <span>{a.headSha?.substring(0, 7)}</span>
                        {isComplete && <>
                          <span>Security: {a.securityScore}</span>
                          <span>{a.changedFiles} files changed</span>
                        </>}
                        <span>{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</span>
                      </div>
                    </div>

                    <ArrowRight size={15} className="text-[hsl(215,20%,35%)] flex-shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export function SecurityPage() {
  const navigate = useNavigate();

  const { data: analysesData } = useQuery({
    queryKey: ['analyses'],
    queryFn: getAllAnalyses
  });

  const analyses = analysesData?.data || [];
  const completedAnalyses = analyses.filter((a: AnalysisRun) =>
    ['AWAITING_FIX', 'RESOLVED', 'COMPLETED'].includes(a.status)
  );

  const avgSecurity = completedAnalyses.length > 0
    ? Math.round(completedAnalyses.reduce((s: number, a: AnalysisRun) => s + a.securityScore, 0) / completedAnalyses.length)
    : 0;

  const blockedBySecurityCount = completedAnalyses.filter((a: AnalysisRun) => a.hardGates.length > 0).length;

  return (
    <AppLayout>
      <PageHeader title="Security" subtitle="Security overview across all analyses" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Avg Security Score', value: avgSecurity || '—', color: avgSecurity >= 80 ? 'text-emerald-400' : 'text-amber-400' },
            { label: 'Analyses Run', value: completedAnalyses.length, color: 'text-brand-400' },
            { label: 'Hard Gates Triggered', value: blockedBySecurityCount, color: blockedBySecurityCount > 0 ? 'text-red-400' : 'text-emerald-400' },
            { label: 'Active Analyses', value: analyses.filter((a: AnalysisRun) => !['AWAITING_FIX', 'RESOLVED', 'COMPLETED', 'FAILED'].includes(a.status)).length, color: 'text-blue-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card p-4 text-center">
              <div className={`text-2xl font-bold ${color} mb-1`}>{value}</div>
              <div className="text-xs text-[hsl(215,20%,45%)]">{label}</div>
            </div>
          ))}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-[hsl(210,40%,90%)] text-sm mb-4">Security by Analysis</h2>
          {completedAnalyses.length === 0 ? (
            <EmptyState
              icon={<Activity size={24} />}
              title="No completed analyses"
              description="Run analyses to see security scores."
            />
          ) : (
            <div className="space-y-2">
              {completedAnalyses.map((a: AnalysisRun) => (
                <button
                  key={a._id}
                  onClick={() => navigate(`/analyses/${a._id}`)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[hsl(222,35%,10%)] transition-colors text-left"
                >
                  <ScoreRing score={a.securityScore} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[hsl(210,40%,88%)]">
                      Iteration #{a.iterationNumber}
                    </div>
                    <div className="text-xs text-[hsl(215,20%,45%)]">{a.headSha?.substring(0, 7)}</div>
                  </div>
                  {a.hardGates.length > 0 && (
                    <span className="text-xs text-red-400 flex items-center gap-1">
                      <AlertTriangle size={11} /> {a.hardGates.length} gate{a.hardGates.length > 1 ? 's' : ''}
                    </span>
                  )}
                  <ArrowRight size={13} className="text-[hsl(215,20%,35%)]" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

export function HistoryPage() {
  const navigate = useNavigate();

  const { data: analysesData, isLoading } = useQuery({
    queryKey: ['analyses'],
    queryFn: getAllAnalyses
  });

  const { data: reposData } = useQuery({
    queryKey: ['repositories'],
    queryFn: getRepositories
  });

  const analyses = analysesData?.data || [];
  const repos = reposData?.data || [];

  return (
    <AppLayout>
      <PageHeader title="History" subtitle="Full analysis history across repositories" />
      <div className="p-6">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : analyses.length === 0 ? (
          <EmptyState
            icon={<Activity size={28} />}
            title="No history yet"
            description="Analysis history will appear here once you run analyses."
          />
        ) : (
          <div className="space-y-2">
            {analyses.map((a: AnalysisRun) => {
              const repo = repos.find((r: Repository) => r._id === a.repositoryId || r.id === a.repositoryId);
              const isComplete = ['AWAITING_FIX', 'RESOLVED', 'PARTIAL', 'COMPLETED'].includes(a.status);

              return (
                <button
                  key={a._id}
                  onClick={() => navigate(`/analyses/${a._id}`)}
                  className="card-hover p-4 text-left w-full"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-xs text-[hsl(215,20%,40%)] w-8 text-center font-mono">
                      #{a.iterationNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-[hsl(210,40%,88%)]">
                          {repo?.fullName || 'Unknown Repo'}
                        </span>
                        {isComplete && <DecisionBadge decision={a.decision} />}
                      </div>
                      <div className="text-xs text-[hsl(215,20%,45%)]">
                        {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })} · {a.headSha?.substring(0, 7)}
                        {isComplete && ` · Score: ${a.releaseScore} · Security: ${a.securityScore}`}
                      </div>
                    </div>
                    <ArrowRight size={14} className="text-[hsl(215,20%,35%)]" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <AppLayout>
      <PageHeader title="Settings" subtitle="Account and application settings" />
      <div className="p-6 space-y-6 max-w-2xl">
        <div className="card p-5">
          <h2 className="font-semibold text-[hsl(210,40%,90%)] text-sm mb-4">Account</h2>
          <div className="flex items-center gap-4">
            <img
              src={user?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`}
              alt={user?.username}
              className="w-14 h-14 rounded-full ring-2 ring-[hsl(222,30%,24%)]"
            />
            <div>
              <div className="font-semibold text-[hsl(210,40%,92%)]">{user?.username}</div>
              <div className="text-sm text-[hsl(215,20%,50%)]">{user?.email || 'No email'}</div>
            </div>
          </div>
          <button
            onClick={async () => { await logout(); navigate('/'); }}
            className="btn-danger mt-4"
          >
            Sign Out
          </button>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-[hsl(210,40%,90%)] text-sm mb-3">About ReleaseRadar</h2>
          <div className="space-y-2 text-sm text-[hsl(215,20%,55%)]">
            <p><strong className="text-[hsl(210,40%,80%)]">Version:</strong> 1.0.0 MVP</p>
            <p><strong className="text-[hsl(210,40%,80%)]">Architecture:</strong> Modular Monolith</p>
            <p><strong className="text-[hsl(210,40%,80%)]">Analysis Engine:</strong> Deterministic + AI Hybrid</p>
            <p><strong className="text-[hsl(210,40%,80%)]">Philosophy:</strong> AI is not the judge. AI is one component inside an engineering loop.</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
