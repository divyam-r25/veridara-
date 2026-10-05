import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, GitBranch, Activity, Shield, History,
  Settings, ChevronRight, Zap, LogOut, Menu, X
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/repositories', icon: GitBranch, label: 'Repositories' },
  { to: '/analyses', icon: Activity, label: 'Analyses' },
  { to: '/security', icon: Shield, label: 'Security' },
  { to: '/history', icon: History, label: 'History' },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const Sidebar = () => (
    <aside className="flex flex-col h-full bg-[hsl(222,47%,7%)] border-r border-[hsl(222,30%,18%)] w-56">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-[hsl(222,30%,18%)]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-900/50">
            <Zap size={16} className="text-white" />
          </div>
          <div>
            <span className="font-bold text-[hsl(210,40%,95%)] text-sm">Veridara</span>
            <div className="text-[10px] text-[hsl(215,20%,45%)] font-medium tracking-wide uppercase">
              Loop Engineering
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              isActive ? 'nav-item-active flex' : 'nav-item flex'
            }
          >
            <Icon size={16} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="px-3 py-4 border-t border-[hsl(222,30%,18%)]">
        <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-item-active flex mb-1' : 'nav-item flex mb-1'}>
          <Settings size={16} />
          <span>Settings</span>
        </NavLink>

        {user && (
          <div className="flex items-center gap-2.5 px-3 py-2 mt-2 rounded-lg bg-[hsl(222,35%,10%)] border border-[hsl(222,30%,18%)]">
            <img
              src={user.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`}
              alt={user.username}
              className="w-7 h-7 rounded-full ring-1 ring-[hsl(222,30%,24%)]"
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-[hsl(210,40%,90%)] truncate">{user.username}</div>
              <div className="text-[10px] text-[hsl(215,20%,45%)] truncate">{user.email || 'GitHub user'}</div>
            </div>
            <button
              onClick={handleLogout}
              className="text-[hsl(215,20%,45%)] hover:text-red-400 transition-colors"
              title="Logout"
            >
              <LogOut size={13} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[hsl(222,47%,5%)]">
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-56 flex-shrink-0">
            <Sidebar />
          </div>
          <div className="flex-1 bg-black/60" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-[hsl(222,30%,18%)] bg-[hsl(222,47%,7%)]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
              <Zap size={14} className="text-white" />
            </div>
            <span className="font-bold text-sm text-[hsl(210,40%,95%)]">Veridara</span>
          </div>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="text-[hsl(215,20%,55%)] hover:text-[hsl(210,40%,95%)]"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {children}
        </div>
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumbs,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
}) {
  const navigate = useNavigate();

  return (
    <div className="px-6 py-5 border-b border-[hsl(222,30%,18%)] bg-[hsl(222,47%,6%)]">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="flex items-center gap-1.5 mb-2 text-xs text-[hsl(215,20%,45%)]">
          {breadcrumbs.map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight size={12} />}
              {b.to ? (
                <button
                  onClick={() => navigate(b.to!)}
                  className="hover:text-[hsl(210,40%,75%)] transition-colors"
                >
                  {b.label}
                </button>
              ) : (
                <span className="text-[hsl(215,20%,60%)]">{b.label}</span>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[hsl(210,40%,95%)]">{title}</h1>
          {subtitle && <p className="text-sm text-[hsl(215,20%,55%)] mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
