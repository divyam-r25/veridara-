import axios from 'axios';
import type {
  User, Repository, PullRequest, AnalysisRun,
  Finding, FixPack, GitHubRepo, GitHubPR, ApiResponse
} from '../types';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
});

// Auth
export const getAuthStatus = () =>
  api.get<ApiResponse<{ authenticated: boolean; demoModeAvailable: boolean }>>('/auth/status').then(r => r.data);

export const demoLogin = () =>
  api.post<ApiResponse<{ user: User; demoMode: boolean }>>('/auth/demo-login').then(r => r.data);

export const getGitHubAuthUrl = () =>
  api.get<ApiResponse<{ url?: string; demoMode?: boolean; demoLoginUrl?: string }>>('/auth/github').then(r => r.data);

export const logout = () =>
  api.post('/auth/logout').then(r => r.data);

// Current user
export const getMe = () =>
  api.get<ApiResponse<User>>('/me').then(r => r.data);

// Repositories
export const getRepositories = () =>
  api.get<ApiResponse<Repository[]>>('/repositories').then(r => r.data);

export const getAvailableRepos = () =>
  api.get<ApiResponse<GitHubRepo[]>>('/repositories/available').then(r => r.data);

export const connectRepository = (owner: string, name: string) =>
  api.post<ApiResponse<Repository>>('/repositories/connect', { owner, name }).then(r => r.data);

export const getRepository = (id: string) =>
  api.get<ApiResponse<Repository>>(`/repositories/${id}`).then(r => r.data);

export const getRepositoryPulls = (id: string, state = 'open') =>
  api.get<ApiResponse<GitHubPR[]>>(`/repositories/${id}/pulls?state=${state}`).then(r => r.data);

// Pull Requests
export const ingestPullRequest = (repositoryId: string, prNumber: number) =>
  api.post<ApiResponse<PullRequest>>('/pulls/ingest', { repositoryId, prNumber }).then(r => r.data);

export const getPullRequest = (id: string) =>
  api.get<ApiResponse<{ pullRequest: PullRequest; analyses: AnalysisRun[] }>>(`/pulls/${id}`).then(r => r.data);

// Analyses
export const createAnalysis = (pullRequestId: string, isDemoAnalysis = false) =>
  api.post<ApiResponse<AnalysisRun>>('/analyses', { pullRequestId, isDemoAnalysis }).then(r => r.data);

export const getAnalysis = (id: string) =>
  api.get<ApiResponse<AnalysisRun>>(`/analyses/${id}`).then(r => r.data);

export const getFindings = (analysisId: string) =>
  api.get<ApiResponse<Finding[]>>(`/analyses/${analysisId}/findings`).then(r => r.data);

export const getFixPack = (analysisId: string) =>
  api.get<ApiResponse<FixPack>>(`/analyses/${analysisId}/fix-pack`).then(r => r.data);

export const recordFixPackCopied = (analysisId: string) =>
  api.post(`/analyses/${analysisId}/fix-pack/copied`).then(r => r.data);

export const triggerVerification = (analysisId: string, newHeadSha?: string) =>
  api.post<ApiResponse<AnalysisRun>>(`/analyses/${analysisId}/verify`, { newHeadSha }).then(r => r.data);

export const getAnalysisHistory = (analysisId: string) =>
  api.get<ApiResponse<AnalysisRun[]>>(`/analyses/${analysisId}/history`).then(r => r.data);

export const getAllAnalyses = () =>
  api.get<ApiResponse<AnalysisRun[]>>('/analyses').then(r => r.data);

// Error handling
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      // Redirect to login on auth failure
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
