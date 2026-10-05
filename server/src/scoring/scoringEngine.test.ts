import { describe, test, expect } from '@jest/globals';
import { calculateScores } from '../scoring/scoringEngine';

describe('Scoring Engine', () => {
  test('calculates weighted release score correctly', () => {
    const result = calculateScores({
      changeRiskScore: 100,
      testReadinessScore: 100,
      apiCompatibilityScore: 100,
      dependencySafetyScore: 100,
      securityScore: 100,
      verificationConfidence: 100,
      findings: []
    });
    expect(result.releaseScore).toBe(100);
    expect(result.decision).toBe('READY');
  });

  test('blocks release on critical security finding', () => {
    const result = calculateScores({
      changeRiskScore: 95,
      testReadinessScore: 95,
      apiCompatibilityScore: 100,
      dependencySafetyScore: 100,
      securityScore: 30,
      verificationConfidence: 0,
      findings: [{
        category: 'SECURITY',
        severity: 'CRITICAL',
        confidence: 0.95,
        title: 'Hardcoded API secret found',
        affectedFiles: ['src/config.ts'],
        status: 'OPEN'
      }]
    });
    expect(result.decision).toBe('BLOCKED');
    expect(result.hardGates.length).toBeGreaterThan(0);
  });

  test('penalizes security score for critical findings', () => {
    const result = calculateScores({
      changeRiskScore: 100,
      testReadinessScore: 100,
      apiCompatibilityScore: 100,
      dependencySafetyScore: 100,
      securityScore: 10, // Already penalized
      verificationConfidence: 100,
      findings: []
    });
    expect(result.securityScore).toBe(10);
  });

  test('cannot report READY when a required analyzer is unavailable', () => {
    const result = calculateScores({
      changeRiskScore: 100,
      testReadinessScore: 100,
      apiCompatibilityScore: 100,
      dependencySafetyScore: 100,
      securityScore: 0,
      verificationConfidence: 100,
      findings: [{ category: 'INFRASTRUCTURE', severity: 'HIGH', confidence: 1, title: 'Security analyzer unavailable', status: 'OPEN' }]
    });
    expect(result.decision).not.toBe('READY');
    expect(result.securityScore).toBe(0);
  });

  test('READY_WITH_REVIEW for 80-89 score', () => {
    const result = calculateScores({
      changeRiskScore: 90,
      testReadinessScore: 80,
      apiCompatibilityScore: 100,
      dependencySafetyScore: 100,
      securityScore: 85,
      verificationConfidence: 60,
      findings: []
    });
    // 90*0.2 + 80*0.2 + 100*0.15 + 100*0.10 + 85*0.25 + 60*0.10
    // = 18 + 16 + 15 + 10 + 21.25 + 6 = 86.25
    expect(result.decision).toBe('READY_WITH_REVIEW');
  });

  test('REVIEW_REQUIRED for 65-79 score', () => {
    const result = calculateScores({
      changeRiskScore: 70,
      testReadinessScore: 60,
      apiCompatibilityScore: 80,
      dependencySafetyScore: 90,
      securityScore: 75,
      verificationConfidence: 0,
      findings: []
    });
    expect(['REVIEW_REQUIRED', 'HIGH_RISK']).toContain(result.decision);
  });
});
