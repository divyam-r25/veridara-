import { IFinding } from '../../models/Finding';

export function findRegressions(findings: Partial<IFinding>[]): Partial<IFinding>[] {
  return findings.filter(finding =>
    (finding.severity === 'CRITICAL' || finding.severity === 'HIGH') &&
    finding.status === 'OPEN'
  );
}
