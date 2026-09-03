/** Action configuration types + agent runtime types. */

export type ApiType = 'openai' | 'openai-chat-compatible' | 'anthropic';
export type ReviewMode = 'standard' | 'agent';

export interface ActionInputs {
  apiType: ApiType;
  apiKey: string;
  baseUrl?: string;
  model: string;
  githubToken: string;
  appTokenUrl?: string;
  triggerComment: string;
  triggerLabel: string;
  autoReview: boolean;
  maxFiles: number;
  maxDiffLines: number;
  excludePatterns: string[];
  useDefaultExcludes: boolean;
  extraInstructions?: string;
  // Agent mode
  reviewMode: ReviewMode;
  agentTarballMaxMb: number;
  contextDocs: string[];
  // Pi engine (agent mode only)
  piVersion: string;
  piTimeoutMs: number;
}

export interface RepoRoot {
  /** Extracted repo root directory. */
  path: string;
  /** Temp working directory to remove on cleanup. */
  workDir: string;
}
