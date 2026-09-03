import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getInputs } from './inputs';

const REQUIRED: Record<string, string> = {
  'INPUT_API-TYPE': 'openai',
  'INPUT_API-KEY': 'sk-test',
  INPUT_MODEL: 'gpt-4o',
  'INPUT_GITHUB-TOKEN': 'ghp_test',
};

const OPTIONAL_DEFAULTS: Record<string, string> = {
  'INPUT_TRIGGER-COMMENT': '',
  'INPUT_TRIGGER-LABEL': '',
  'INPUT_AUTO-REVIEW': 'false',
  'INPUT_MAX-FILES': '',
  'INPUT_MAX-DIFF-LINES': '',
  'INPUT_EXCLUDE-PATTERNS': '',
  'INPUT_USE-DEFAULT-EXCLUDES': 'true',
  'INPUT_EXTRA-INSTRUCTIONS': '',
  'INPUT_REVIEW-MODE': '',
  'INPUT_AGENT-TARBALL-MAX-MB': '',
  'INPUT_CONTEXT-DOCS': '',
  'INPUT_PI-VERSION': '',
  'INPUT_PI-TIMEOUT-MS': '',
  'INPUT_BASE-URL': '',
};

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const k of [...Object.keys(REQUIRED), ...Object.keys(OPTIONAL_DEFAULTS)]) {
    savedEnv[k] = process.env[k];
  }
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function setEnv(overrides: Record<string, string> = {}): void {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('INPUT_')) delete process.env[k];
  }
  for (const [k, v] of Object.entries({ ...REQUIRED, ...OPTIONAL_DEFAULTS, ...overrides })) {
    process.env[k] = v;
  }
}

describe('getInputs', () => {
  it('returns parsed inputs with defaults', () => {
    setEnv();
    const inputs = getInputs();
    expect(inputs).toMatchObject({
      apiType: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4o',
      githubToken: 'ghp_test',
      triggerComment: '/ai-review',
      triggerLabel: 'ai-review',
      autoReview: false,
      maxFiles: 20,
      maxDiffLines: 3000,
      useDefaultExcludes: true,
      reviewMode: 'standard',
      agentTarballMaxMb: 200,
      piVersion: '0.82.1',
      piTimeoutMs: 600000,
      contextDocs: ['AGENTS.md', '.ai-review.md', 'CONTRIBUTING.md'],
    });
  });

  it('accepts user-supplied contextDocs and skips the default', () => {
    setEnv({ 'INPUT_CONTEXT-DOCS': 'docs/foo.md, docs/bar.md' });
    expect(getInputs().contextDocs).toEqual(['docs/foo.md', 'docs/bar.md']);
  });

  it('throws on invalid api-type', () => {
    setEnv({ 'INPUT_API-TYPE': 'bogus' });
    expect(() => getInputs()).toThrow(/Invalid api-type 'bogus'/);
  });

  it('throws on invalid review-mode', () => {
    setEnv({ 'INPUT_REVIEW-MODE': 'hybrid' });
    expect(() => getInputs()).toThrow(/Invalid review-mode 'hybrid'/);
  });

  it('throws on non-numeric max-files', () => {
    setEnv({ 'INPUT_MAX-FILES': 'abc' });
    expect(() => getInputs()).toThrow(/Invalid max-files/);
  });

  it('throws on negative max-files', () => {
    setEnv({ 'INPUT_MAX-FILES': '-5' });
    expect(() => getInputs()).toThrow(/Invalid max-files/);
  });

  it('throws on non-numeric pi-timeout-ms', () => {
    setEnv({ 'INPUT_PI-TIMEOUT-MS': 'forever' });
    expect(() => getInputs()).toThrow(/Invalid pi-timeout-ms/);
  });

  it('throws on pi-version with shell metacharacters', () => {
    setEnv({ 'INPUT_PI-VERSION': '0.82.1; rm -rf /' });
    expect(() => getInputs()).toThrow(/Invalid pi-version/);
  });

  it('accepts semver, prerelease, and dist-tag pi-versions', () => {
    for (const v of ['0.82.1', '1.0.0-rc.1', 'latest', 'next']) {
      setEnv({ 'INPUT_PI-VERSION': v });
      expect(getInputs().piVersion).toBe(v);
    }
  });

  it('requires base-url for openai-chat-compatible', () => {
    setEnv({ 'INPUT_API-TYPE': 'openai-chat-compatible' });
    expect(() => getInputs()).toThrow(/base-url.*required/);
  });

  it('accepts base-url for openai-chat-compatible', () => {
    setEnv({ 'INPUT_API-TYPE': 'openai-chat-compatible', 'INPUT_BASE-URL': 'https://x/v1' });
    expect(getInputs().baseUrl).toBe('https://x/v1');
  });

  it('accepts an https app-token-url', () => {
    setEnv({ 'INPUT_APP-TOKEN-URL': 'https://api.reviewally.nethbotheju.dev/token' });
    expect(getInputs().appTokenUrl).toBe('https://api.reviewally.nethbotheju.dev/token');
  });

  it('rejects an http app-token-url (token would leak in cleartext)', () => {
    setEnv({ 'INPUT_APP-TOKEN-URL': 'http://api.reviewally.nethbotheju.dev/token' });
    expect(() => getInputs()).toThrow(/app-token-url.*https/);
  });

  it('rejects a malformed app-token-url', () => {
    setEnv({ 'INPUT_APP-TOKEN-URL': 'not a url' });
    expect(() => getInputs()).toThrow(/Invalid app-token-url/);
  });
});
