import * as core from '@actions/core';
import type { ActionInputs, ApiType, ReviewMode } from './types';

const VALID_API_TYPES = new Set<ApiType>(['openai', 'openai-chat-compatible', 'anthropic']);
const VALID_REVIEW_MODES = new Set<ReviewMode>(['standard', 'agent']);
const DEFAULT_PI_VERSION = '0.82.1';
// Injection-safe version spec (semver, prerelease, dist-tag). No spaces/shell metachars.
const VERSION_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._+\-]*$/;

function parseList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseIntInput(name: string, fallback: number): number {
  const raw = core.getInput(name).trim();
  if (raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid ${name} '${raw}'. Must be a non-negative integer.`);
  }
  return n;
}

export function getInputs(): ActionInputs {
  const apiTypeRaw = core.getInput('api-type', { required: true }).trim();
  if (!VALID_API_TYPES.has(apiTypeRaw as ApiType)) {
    throw new Error(
      `Invalid api-type '${apiTypeRaw}'. Must be one of: ${[...VALID_API_TYPES].join(', ')}`,
    );
  }
  const apiType = apiTypeRaw as ApiType;

  const apiKey = core.getInput('api-key', { required: true });
  const baseUrl = core.getInput('base-url').trim() || undefined;

  if (apiType === 'openai-chat-compatible' && !baseUrl) {
    throw new Error("'base-url' is required when api-type is 'openai-chat-compatible'.");
  }

  const model = core.getInput('model', { required: true });
  const githubToken = core.getInput('github-token', { required: true });
  let appTokenUrl = core.getInput('app-token-url').trim() || undefined;
  if (appTokenUrl) {
    let parsed: URL;
    try {
      parsed = new URL(appTokenUrl);
    } catch {
      throw new Error(`Invalid app-token-url '${appTokenUrl}'. Must be a valid URL.`);
    }
    if (parsed.protocol !== 'https:') {
      // The workflow GITHUB_TOKEN is sent to this endpoint; http:// would leak it in cleartext.
      throw new Error(
        `Invalid app-token-url '${appTokenUrl}'. Must be an https:// URL — the workflow token is sent to this endpoint.`,
      );
    }
    appTokenUrl = parsed.toString();
  }
  const triggerComment = core.getInput('trigger-comment').trim() || '/ai-review';
  const triggerLabel = core.getInput('trigger-label').trim() || 'ai-review';
  const autoReview = core.getBooleanInput('auto-review');
  const maxFiles = parseIntInput('max-files', 20);
  const maxDiffLines = parseIntInput('max-diff-lines', 3000);
  const excludePatterns = parseList(core.getInput('exclude-patterns'));
  const useDefaultExcludes = core.getBooleanInput('use-default-excludes');
  const extraInstructions = core.getInput('extra-instructions').trim() || undefined;

  const reviewModeRaw = core.getInput('review-mode').trim().toLowerCase() || 'standard';
  if (!VALID_REVIEW_MODES.has(reviewModeRaw as ReviewMode)) {
    throw new Error(
      `Invalid review-mode '${reviewModeRaw}'. Must be one of: ${[...VALID_REVIEW_MODES].join(', ')}`,
    );
  }
  const reviewMode = reviewModeRaw as ReviewMode;

  const agentTarballMaxMb = parseIntInput('agent-tarball-max-mb', 200);
  const contextDocs = parseList(core.getInput('context-docs'));

  const piVersion = core.getInput('pi-version').trim() || DEFAULT_PI_VERSION;
  if (!VERSION_PATTERN.test(piVersion)) {
    throw new Error(
      `Invalid pi-version '${piVersion}'. Must be a plain version or dist-tag (e.g. 0.82.1, latest).`,
    );
  }

  const piTimeoutMs = parseIntInput('pi-timeout-ms', 600000);

  return {
    apiType,
    apiKey,
    baseUrl,
    model,
    githubToken,
    appTokenUrl,
    triggerComment,
    triggerLabel,
    autoReview,
    maxFiles,
    maxDiffLines,
    excludePatterns,
    useDefaultExcludes,
    extraInstructions,
    reviewMode,
    agentTarballMaxMb,
    contextDocs:
      contextDocs.length > 0 ? contextDocs : ['AGENTS.md', '.ai-review.md', 'CONTRIBUTING.md'],
    piVersion,
    piTimeoutMs,
  };
}
