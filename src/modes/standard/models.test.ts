import { describe, it, expect } from 'vitest';
import type { ActionInputs, ApiType } from '../../config/types';
import { createModel } from './models';

function makeInputs(overrides: Partial<ActionInputs> = {}): ActionInputs {
  return {
    apiType: 'openai',
    apiKey: 'sk-test',
    model: 'gpt-4o',
    githubToken: 'token',
    triggerComment: '/reviewally',
    triggerLabel: 'reviewally',
    autoReview: false,
    maxFiles: 20,
    maxDiffLines: 3000,
    excludePatterns: [],
    useDefaultExcludes: true,
    reviewMode: 'standard',
    agentTarballMaxMb: 200,
    contextDocs: ['AGENTS.md'],
    piVersion: '0.82.1',
    piTimeoutMs: 600000,
    ...overrides,
  };
}

describe('createModel', () => {
  // Regression guard: openai-chat-compatible MUST use the Chat Completions API,
  // not @ai-sdk/openai's default (Responses). Most compatible endpoints only
  // implement /chat/completions, so factory(model) -> /responses breaks them.
  it('routes openai-chat-compatible through chat completions', () => {
    const model = createModel(
      makeInputs({ apiType: 'openai-chat-compatible' as ApiType, baseUrl: 'https://x/v1' }),
    );
    expect((model as { provider: string }).provider).toBe('openai.chat');
  });

  it('keeps native openai on the Responses API', () => {
    expect((createModel(makeInputs({ apiType: 'openai' })) as { provider: string }).provider).toBe(
      'openai.responses',
    );
  });

  it('requires base-url for openai-chat-compatible', () => {
    expect(() => createModel(makeInputs({ apiType: 'openai-chat-compatible' as ApiType }))).toThrow(
      /base-url/,
    );
  });
});
