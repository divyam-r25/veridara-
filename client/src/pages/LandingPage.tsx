import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Shield, GitBranch, RefreshCw, ArrowRight, Github } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getGitHubAuthUrl } from '../services/api';
import { Spinner } from '../components/ui';

export function LandingPage() {
  const { user, isAuthenticated, loginAsDemo, demoModeAvailable, loading } = useAuth();
  const navigate = useNavigate();
  const [authLoading, setAuthLoading] = useState(false);

  React.useEffect(() => {
    if (isAuthenticated) navigate('/dashboard');
  }, [isAuthenticated, navigate]);

  const handleGitHubLogin = async () => {
    setAuthLoading(true);
    try {
      const result = await getGitHubAuthUrl();
      if (result.data.url) {
        window.location.href = result.data.url;
      } else if (result.data.demoMode) {
        // No GitHub configured, use demo login
        await loginAsDemo();
        navigate('/dashboard');
      }
    } catch (err) {
      console.error('Auth failed:', err);
      setAuthLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setAuthLoading(true);
    try {
      await loginAsDemo();
      navigate('/dashboard');
    } catch (err) {
      console.error('Demo login failed:', err);
      setAuthLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(222,47%,5%)] flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 border-b border-[hsl(222,30%,15%)] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-900/50">
            <Zap size={16} className="text-white" />
          </div>
          <span className="font-bold text-[hsl(210,40%,95%)]">ReleaseRadar</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleGitHubLogin}
            disabled={authLoading}
            className="btn-primary"
          >
            {authLoading ? <Spinner size={14} /> : <Github size={15} />}
            Sign in with GitHub
          </button>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-900/30 border border-brand-700/30 text-brand-400 text-xs font-medium mb-8">
          <Zap size={12} />
          Loop Engineering for AI-Assisted Development
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold text-[hsl(210,40%,97%)] max-w-4xl leading-tight mb-6">
          The verification loop for{' '}
          <span className="bg-gradient-to-r from-brand-400 to-violet-400 bg-clip-text text-transparent">
            AI-assisted software
          </span>
        </h1>

        <p className="text-lg text-[hsl(215,20%,55%)] max-w-2xl mb-10 leading-relaxed">
          Analyze. Explain. Fix. Verify. Release.
          <br />
          ReleaseRadar independently verifies whether AI-generated changes actually resolved the risks — or introduced new ones.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 mb-16">
          <button
            onClick={handleGitHubLogin}
            disabled={authLoading}
            className="btn-primary px-6 py-2.5 text-base"
          >
            {authLoading ? <Spinner size={16} /> : <Github size={18} />}
            Start with GitHub
            <ArrowRight size={16} />
          </button>

          {demoModeAvailable && (
            <button
              onClick={handleDemoLogin}
              disabled={authLoading}
              className="btn-secondary px-6 py-2.5 text-base"
            >
              {authLoading ? <Spinner size={16} /> : <Zap size={16} />}
              Try Demo Mode
            </button>
          )}
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl w-full">
          {[
            {
              icon: <Shield size={22} className="text-red-400" />,
              title: 'Release Intelligence',
              desc: 'Is this change safe enough to ship? Get a deterministic score with full explanation.',
              color: 'border-red-500/20 bg-red-900/10'
            },
            {
              icon: <Shield size={22} className="text-orange-400" />,
              title: 'Security Radar',
              desc: 'Detect secrets, prompt injection, dependency risks, and app security vulnerabilities.',
              color: 'border-orange-500/20 bg-orange-900/10'
            },
            {
              icon: <GitBranch size={22} className="text-brand-400" />,
              title: 'AI Fix Pack',
              desc: 'Generate a copy-ready remediation prompt for any AI coding agent.',
              color: 'border-brand-500/20 bg-brand-900/10'
            },
            {
              icon: <RefreshCw size={22} className="text-emerald-400" />,
              title: 'Loop Verification',
              desc: 'Independently verify whether the fix actually resolved the original risk.',
              color: 'border-emerald-500/20 bg-emerald-900/10'
            }
          ].map((f, i) => (
            <div key={i} className={`card border ${f.color} p-5 text-left`}>
              <div className="mb-3">{f.icon}</div>
              <h3 className="font-semibold text-[hsl(210,40%,92%)] mb-1.5 text-sm">{f.title}</h3>
              <p className="text-xs text-[hsl(215,20%,50%)] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Loop diagram */}
        <div className="mt-16 max-w-3xl w-full">
          <h2 className="text-sm font-semibold text-[hsl(215,20%,45%)] uppercase tracking-wider mb-6">
            The Loop Engineering Flow
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
            {[
              'GitHub Change', 'Observe', 'Context Firewall',
              'Deterministic Analysis', 'Security Analysis',
              'AI Reasoning', 'Release Decision', 'Evidence Report',
              'AI Fix Pack', 'Developer / AI Agent', 'New Commit',
              'Re-analysis', 'Independent Verification', 'Regression Detection',
              'Final Decision'
            ].map((step, i, arr) => (
              <React.Fragment key={i}>
                <span className="px-3 py-1.5 rounded-lg bg-[hsl(222,35%,12%)] border border-[hsl(222,30%,20%)] text-[hsl(210,40%,80%)] text-xs font-medium">
                  {step}
                </span>
                {i < arr.length - 1 && (
                  <ArrowRight size={12} className="text-[hsl(215,20%,35%)]" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </main>

      <footer className="px-6 py-4 border-t border-[hsl(222,30%,15%)] text-center text-xs text-[hsl(215,20%,35%)]">
        ReleaseRadar — AI is not the judge. AI is one component inside an engineering loop.
      </footer>
    </div>
  );
}
