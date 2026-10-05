import { IFinding } from '../../models/Finding';

export type FindingVerdict = 'RESOLVED' | 'PARTIALLY_RESOLVED' | 'UNRESOLVED';

/** Compare original findings against independently-produced findings. */
export function verifyOriginalFinding(original: IFinding, current: Partial<IFinding>[]): FindingVerdict {
  const originalFiles = new Set(original.affectedFiles || []);
  const related = current.filter(candidate =>
    candidate.category === original.category &&
    (candidate.affectedFiles || []).some(file => originalFiles.has(file))
  );
  if (related.some(finding => finding.severity === 'CRITICAL' || finding.severity === 'HIGH')) return 'UNRESOLVED';
  if (related.length > 0) return 'PARTIALLY_RESOLVED';
  return 'RESOLVED';
}
