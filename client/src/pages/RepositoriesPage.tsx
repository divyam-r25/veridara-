import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { GitBranch, Plus, Lock, Globe, Star, ArrowRight, Check, Loader2 } from 'lucide-react';
import { AppLayout, PageHeader } from '../components/Layout';
import { EmptyState, Skeleton, Toast } from '../components/ui';
import { getRepositories, getAvailableRepos, connectRepository } from '../services/api';
import type { Repository, GitHubRepo } from '../types';
import { formatDistanceToNow } from 'date-fns';

function RepoCard({ repo, onSelect }: { repo: Repository; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="card-hover p-4 text-left w-full group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[hsl(222,35%,12%)] border border-[hsl(222,30%,20%)] flex items-center justify-center flex-shrink-0 text-brand-400">
            <GitBranch size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[hsl(210,40%,92%)] text-sm truncate">{repo.fullName}</span>
              {repo.private ? (
                <Lock size={11} className="text-[hsl(215,20%,40%)]" />
              ) : (
                <Globe size={11} className="text-[hsl(215,20%,40%)]" />
              )}
            </div>
            {repo.description && (
              <p className="text-xs text-[hsl(215,20%,50%)] mt-0.5 truncate">{repo.description}</p>
            )}
            <div className="flex items-center gap-3 mt-1.5 text-xs text-[hsl(215,20%,40%)]">
              {repo.language && <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-brand-500 inline-block" />
                {repo.language}
              </span>}
              <span>Updated {formatDistanceToNow(new Date(repo.updatedAt), { addSuffix: true })}</span>
            </div>
          </div>
        </div>
        <ArrowRight size={15} className="text-[hsl(215,20%,35%)] group-hover:text-brand-400 transition-colors flex-shrink-0 mt-1" />
      </div>
    </button>
  );
}

function AvailableRepoCard({
  repo,
  onConnect,
  connecting,
  connected,
}: {
  repo: GitHubRepo;
  onConnect: () => void;
  connecting: boolean;
  connected: boolean;
}) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className="w-9 h-9 rounded-lg bg-[hsl(222,35%,12%)] border border-[hsl(222,30%,20%)] flex items-center justify-center flex-shrink-0 text-[hsl(215,20%,45%)]">
        <GitBranch size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[hsl(210,40%,90%)] text-sm truncate">{repo.full_name}</span>
          {repo.private ? <Lock size={11} className="text-[hsl(215,20%,40%)]" /> : null}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-[hsl(215,20%,40%)]">
          {repo.language && <span>{repo.language}</span>}
          {repo.stargazers_count !== undefined && (
            <span className="flex items-center gap-1"><Star size={10} /> {repo.stargazers_count}</span>
          )}
        </div>
      </div>
      <button
        onClick={onConnect}
        disabled={connecting || connected}
        className={connected ? 'btn-secondary text-xs text-emerald-400 border-emerald-500/30' : 'btn-primary text-xs'}
      >
        {connecting ? <Loader2 size={12} className="animate-spin" /> :
         connected ? <><Check size={12} /> Connected</> :
         <><Plus size={12} /> Connect</>}
      </button>
    </div>
  );
}

export function RepositoriesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showAvailable, setShowAvailable] = useState(false);
  const [connectingRepos, setConnectingRepos] = useState<Set<string>>(new Set());
  const [connectedRepos, setConnectedRepos] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data: reposData, isLoading } = useQuery({
    queryKey: ['repositories'],
    queryFn: getRepositories
  });

  const { data: availableData, isLoading: loadingAvailable } = useQuery({
    queryKey: ['available-repos'],
    queryFn: getAvailableRepos,
    enabled: showAvailable
  });

  const repos = reposData?.data || [];
  const available = availableData?.data || [];

  const handleConnect = async (repo: GitHubRepo) => {
    const key = repo.full_name;
    setConnectingRepos(prev => new Set([...prev, key]));

    try {
      const [owner, name] = repo.full_name.split('/');
      await connectRepository(owner, name);
      setConnectedRepos(prev => new Set([...prev, key]));
      queryClient.invalidateQueries({ queryKey: ['repositories'] });
      setToast({ message: `${repo.name} connected successfully!`, type: 'success' });
    } catch {
      setToast({ message: 'Failed to connect repository', type: 'error' });
    } finally {
      setConnectingRepos(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Repositories"
        subtitle="Manage connected GitHub repositories"
        actions={
          <button
            onClick={() => setShowAvailable(!showAvailable)}
            className="btn-primary"
          >
            <Plus size={15} />
            Connect Repository
          </button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Connect panel */}
        {showAvailable && (
          <div className="card p-5 animate-slide-up">
            <h2 className="font-semibold text-[hsl(210,40%,90%)] text-sm mb-4">
              Available Repositories
            </h2>
            {loadingAvailable ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
              </div>
            ) : available.length === 0 ? (
              <p className="text-sm text-[hsl(215,20%,50%)]">No repositories found.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
                {available.map(repo => (
                  <AvailableRepoCard
                    key={repo.id}
                    repo={repo}
                    onConnect={() => handleConnect(repo)}
                    connecting={connectingRepos.has(repo.full_name)}
                    connected={connectedRepos.has(repo.full_name) || repos.some(r => r.githubRepoId === String(repo.id))}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Connected repos */}
        <div>
          <h2 className="font-semibold text-[hsl(210,40%,90%)] text-sm mb-3">Connected Repositories</h2>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : repos.length === 0 ? (
            <EmptyState
              icon={<GitBranch size={28} />}
              title="No repositories connected"
              description="Connect your first GitHub repository to start analyzing release readiness."
              action={
                <button onClick={() => setShowAvailable(true)} className="btn-primary">
                  <Plus size={15} /> Connect Repository
                </button>
              }
            />
          ) : (
            <div className="space-y-2">
              {repos.map(repo => (
                <RepoCard
                  key={repo._id}
                  repo={repo}
                  onSelect={() => navigate(`/repositories/${repo._id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </AppLayout>
  );
}
