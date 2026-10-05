import React, { useEffect } from 'react';
import type { FindingSeverity, ReleaseDecision, FindingStatus } from '../types';

interface SeverityBadgeProps {
  severity: FindingSeverity;
  size?: 'sm' | 'md';
}

const SEVERITY_CONFIG = {
  CRITICAL: { className: 'badge-critical', label: 'Critical', dot: 'bg-red-500' },
  HIGH: { className: 'badge-high', label: 'High', dot: 'bg-orange-500' },
  MEDIUM: { className: 'badge-medium', label: 'Medium', dot: 'bg-amber-500' },
  LOW: { className: 'badge-low', label: 'Low', dot: 'bg-blue-500' },
  INFO: { className: 'badge-info', label: 'Info', dot: 'bg-slate-500' },
};

export function SeverityBadge({ severity, size = 'md' }: SeverityBadgeProps) {
  const cfg = SEVERITY_CONFIG[severity];
  return (
    <span className={`${cfg.className} ${size === 'sm' ? 'text-xs px-2 py-0.5' : ''}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} inline-block`} />
      {cfg.label}
    </span>
  );
}

const DECISION_CONFIG: Record<ReleaseDecision, { className: string; label: string; icon: string }> = {
  READY: { className: 'decision-ready', label: 'Ready', icon: '✓' },
  READY_WITH_REVIEW: { className: 'decision-ready-with-review', label: 'Ready with Review', icon: '~' },
  REVIEW_REQUIRED: { className: 'decision-review-required', label: 'Review Required', icon: '!' },
  HIGH_RISK: { className: 'decision-high-risk', label: 'High Risk', icon: '⚠' },
  BLOCKED: { className: 'decision-blocked', label: 'Blocked', icon: '✕' },
};

export function DecisionBadge({ decision }: { decision: ReleaseDecision }) {
  const cfg = DECISION_CONFIG[decision];
  return (
    <span className={cfg.className}>
      <span>{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}

const STATUS_CONFIG: Record<FindingStatus, { className: string; label: string }> = {
  OPEN: { className: 'badge-high', label: 'Open' },
  IN_PROGRESS: { className: 'badge-warning', label: 'In Progress' },
  RESOLVED: { className: 'badge-success', label: 'Resolved' },
  PARTIALLY_RESOLVED: { className: 'badge-warning', label: 'Partial' },
  REGRESSED: { className: 'badge-critical', label: 'Regressed' },
  WONT_FIX: { className: 'badge-info', label: "Won't Fix" },
};

export function FindingStatusBadge({ status }: { status: FindingStatus }) {
  const cfg = STATUS_CONFIG[status];
  return <span className={cfg.className}>{cfg.label}</span>;
}

export function ScoreRing({
  score,
  size = 80,
  label,
  colorClass,
}: {
  score: number;
  size?: number;
  label?: string;
  colorClass?: string;
}) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const getColor = () => {
    if (colorClass) return colorClass;
    if (score >= 90) return '#10b981';
    if (score >= 80) return '#14b8a6';
    if (score >= 65) return '#f59e0b';
    if (score >= 40) return '#f97316';
    return '#ef4444';
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div style={{ width: size, height: size }} className="relative">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(222,30%,16%)"
            strokeWidth="6"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={getColor()}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.7s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-bold text-[hsl(210,40%,95%)]" style={{ fontSize: size * 0.22 }}>
            {score}
          </span>
        </div>
      </div>
      {label && <span className="text-xs text-[hsl(215,20%,55%)] font-medium">{label}</span>}
    </div>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    SECURITY: 'bg-red-500/10 text-red-400 border-red-500/20',
    CORRECTNESS: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    TESTING: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    API: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    DEPENDENCY: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    INFRASTRUCTURE: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    AI_CONTEXT: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    ARCHITECTURE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colors[category] || 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
      {category.replace(/_/g, ' ')}
    </span>
  );
}

export function ProgressBar({ value, max = 100, colorClass }: { value: number; max?: number; colorClass?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color = colorClass || (
    pct >= 80 ? 'bg-emerald-500' :
    pct >= 60 ? 'bg-amber-500' :
    pct >= 40 ? 'bg-orange-500' : 'bg-red-500'
  );

  return (
    <div className="progress-bar w-full">
      <div
        className={`progress-fill ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-[hsl(222,35%,12%)] border border-[hsl(222,30%,20%)] flex items-center justify-center mb-4 text-[hsl(215,20%,45%)]">
        {icon}
      </div>
      <h3 className="font-semibold text-[hsl(210,40%,85%)] mb-2">{title}</h3>
      <p className="text-sm text-[hsl(215,20%,50%)] max-w-sm mb-6">{description}</p>
      {action}
    </div>
  );
}

export function Toast({
  message,
  type = 'success',
  onClose,
}: {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const styles = {
    success: 'bg-emerald-900/80 border-emerald-700/50 text-emerald-300',
    error: 'bg-red-900/80 border-red-700/50 text-red-300',
    info: 'bg-brand-900/80 border-brand-700/50 text-brand-300',
  };

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm shadow-2xl toast-enter ${styles[type]}`}>
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100 text-xs">✕</button>
    </div>
  );
}

