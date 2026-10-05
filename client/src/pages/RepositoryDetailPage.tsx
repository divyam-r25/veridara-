import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { GitPullRequest, Play, Loader2 } from 'lucide-react';
import { AppLayout, PageHeader } from '../components/Layout';
import { EmptyState, Skeleton, Toast } from '../components/ui';
import {
  getRepository, getRepositoryPulls, ingestPullRequest,
  createAnalysis
} from '../services/api';
import type { GitHubPR } from '../types';
import { useAuth } from '../hooks/useAuth';

export function RepositoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [analyzingPr, setAnalyzingPr] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data: repoData, isLoading: loadingRepo } = useQuery({
    queryKey: ['repository', id],
    queryFn: () => getRepository(id!),
    enabled: !!id
  });

  const { data: pullsData, isLoading: loadingPulls } = useQuery({
    queryKey: ['repository-pulls', id],
    queryFn: () => getRepositoryPulls(id!),
    enabled: !!id
  });

  const repo = repoData?.data;
  const pulls = pullsData?.data || [];
  const isDemoMode = user?.username === 'demo-developer' || pullsData?.demoMode;

  const handleAnalyze = async (pr: GitHubPR) => {
    if (!id || !repo) return;
    setAnalyzingPr(pr.number);

    try {
      // First ingest the PR
      const prResult = await ingestPullRequest(id, pr.number);
      const prId = prResult.data._id;

      // Then create analysis
      const analysisResult = await createAnalysis(prId, isDemoMode);
      const analysisId = analysisResult.data._id;

      navigate(`/analyses/${analysisId}`);
    } catch (err) {
      setToast({ message: 'Failed to start analysis', type: 'error' });
      setAnalyzingPr(null);
    }
  };

  if (loadingRepo) {
    return (
      <AppLayout>
        <div className="p-6 space-y-4">
          <Skeleton className="h-12 w-64 rounded-lg" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title={repo?.fullName || 'Repository'}
        subtitle={repo?.description || `${repo?.language || ''} · ${repo?.defaultBranch || 'main'}`}
        breadcrumbs={[
          { label: 'Repositories', to: '/repositories' },
          { label: repo?.name || 'Repo' }
        ]}
      />

      <div className="p-6 space-y-6">
        {/* PR list */}
        <div>
          <h2 className="font-semibold text-[hsl(210,40%,90%)] text-sm mb-3 flex items-center gap-2">
            <GitPullRequest size={15} />
            Pull Requests
          </h2>

          {loadingPulls ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : pulls.length === 0 ? (
            <EmptyState
              icon={<GitPullRequest size={28} />}
              title="No open pull requests"
              description="Open a pull request on GitHub to analyze it with Veridara."
            />
          ) : (
            <div className="space-y-2">
              {pulls.map((pr: GitHubPR) => (
                <div key={pr.number} className="card p-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-1">
                      <span className="text-xs text-brand-400 font-mono font-medium">#{pr.number}</span>
                      <span className="font-semibold text-[hsl(210,40%,92%)] text-sm leading-tight">{pr.title}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[hsl(215,20%,45%)]">
                      <span>by {pr.user?.login || pr.author}</span>
                      {pr.additions !== undefined && (
                        <span className="text-emerald-500">+{pr.additions}</span>
                      )}
                      {pr.deletions !== undefined && (
                        <span className="text-red-500">-{pr.deletions}</span>
                      )}
                      {(pr.changed_files || pr.changedFiles) && (
                        <span>{pr.changed_files || pr.changedFiles} files</span>
                      )}
                    </div>
                    {pr.body && (
                      <p className="text-xs text-[hsl(215,20%,45%)] mt-1 line-clamp-2">
                        {pr.body.substring(0, 150)}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => handleAnalyze(pr)}
                    disabled={analyzingPr === pr.number}
                    className="btn-primary text-xs flex-shrink-0"
                  >
                    {analyzingPr === pr.number ? (
                      <><Loader2 size={13} className="animate-spin" /> Analyzing...</>
                    ) : (
                      <><Play size={13} /> Analyze</>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </AppLayout>
  );
}
