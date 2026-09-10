import { randomUUID } from 'node:crypto';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';
import type { ActionInputs } from '../../config/types';

const USER_AGENT = 'reviewally';

/** OpenCode Zen requires clients to identify themselves and send a stable session id. */
function isOpenCodeZen(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === 'opencode.ai' || host.endsWith('.opencode.ai');
  } catch {
    return false;
  }
}

export function createModel(inputs: ActionInputs): LanguageModel {
  switch (inputs.apiType) {
    case 'openai': {
      const factory = createOpenAI({ apiKey: inputs.apiKey });
      return factory(inputs.model);
    }
    case 'openai-chat-compatible': {
      if (!inputs.baseUrl) {
        throw new Error("'base-url' is required when api-type is 'openai-chat-compatible'.");
      }
      const headers: Record<string, string> = { 'user-agent': USER_AGENT };
      if (isOpenCodeZen(inputs.baseUrl)) headers['x-opencode-session'] = randomUUID();
      const factory = createOpenAI({ apiKey: inputs.apiKey, baseURL: inputs.baseUrl, headers });
      return factory.chat(inputs.model);
    }
    case 'anthropic': {
      const factory = createAnthropic({ apiKey: inputs.apiKey });
      return factory(inputs.model);
    }
    default: {
      const _exhaustive: never = inputs.apiType;
      throw new Error(`Unsupported api-type: ${_exhaustive as string}`);
    }
  }
}
