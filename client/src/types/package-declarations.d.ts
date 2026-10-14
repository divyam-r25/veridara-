/*
 * The locked lucide-react@1.52.0 and date-fns@4.4.0 tarballs currently omit
 * their package-root declaration entrypoints. Keep this narrowly scoped shim
 * until the upstream packages publish corrected type entrypoints.
 */
declare module 'date-fns' {
  export function formatDistanceToNow(date: Date | number | string, options?: unknown): string;
  export function format(date: Date | number | string, formatString: string, options?: unknown): string;
}

declare module 'lucide-react' {
  import type { ComponentType, SVGProps } from 'react';

  type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: string | number }>;

  export const Activity: Icon;
  export const AlertTriangle: Icon;
  export const ArrowRight: Icon;
  export const Check: Icon;
  export const CheckCircle: Icon;
  export const ChevronDown: Icon;
  export const ChevronRight: Icon;
  export const ChevronUp: Icon;
  export const Copy: Icon;
  export const Cpu: Icon;
  export const Download: Icon;
  export const FileCode: Icon;
  export const GitBranch: Icon;
  export const GitPullRequest: Icon;
  export const Globe: Icon;
  export const History: Icon;
  export const Info: Icon;
  export const LayoutDashboard: Icon;
  export const Loader2: Icon;
  export const Lock: Icon;
  export const LogOut: Icon;
  export const Menu: Icon;
  export const Play: Icon;
  export const Plus: Icon;
  export const RefreshCw: Icon;
  export const Settings: Icon;
  export const Shield: Icon;
  export const ShieldAlert: Icon;
  export const Star: Icon;
  export const TrendingUp: Icon;
  export const X: Icon;
  export const Zap: Icon;
}
