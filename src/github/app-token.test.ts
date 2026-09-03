import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAppToken } from './app-token';

const realFetch = globalThis.fetch;

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(status: number, body: unknown) {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

describe('fetchAppToken', () => {
  it('posts the repo with the workflow token and returns the minted token', async () => {
    stubFetch(200, { token: 'ghs_minted', expires_at: '2025-01-01T00:00:00Z' });

    const out = await fetchAppToken('https://minter.example/token', 'ghs_wf', 'owner/name');

    expect(out).toEqual({ token: 'ghs_minted', expiresAt: '2025-01-01T00:00:00Z' });
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://minter.example/token');
    expect(init.method).toBe('POST');
    expect(String(init.headers)).toContain('Bearer ghs_wf');
    expect(JSON.parse(String(init.body))).toEqual({ repo: 'owner/name' });
  });

  it('surfaces the minter error on 404 (app not installed)', async () => {
    stubFetch(404, { error: 'ReviewAlly is not installed on this repo' });

    await expect(
      fetchAppToken('https://minter.example/token', 'ghs_wf', 'owner/name'),
    ).rejects.toThrow('404: ReviewAlly is not installed on this repo');
  });

  it('handles non-JSON error bodies', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('bad gateway', { status: 502 }),
    ) as unknown as typeof fetch;

    await expect(
      fetchAppToken('https://minter.example/token', 'ghs_wf', 'owner/name'),
    ).rejects.toThrow('HTTP 502');
  });

  it('wraps network failures', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    await expect(
      fetchAppToken('https://minter.example/token', 'ghs_wf', 'owner/name'),
    ).rejects.toThrow('could not reach app-token endpoint: ECONNREFUSED');
  });

  it('rejects a 200 response with no token', async () => {
    stubFetch(200, {});

    await expect(
      fetchAppToken('https://minter.example/token', 'ghs_wf', 'owner/name'),
    ).rejects.toThrow('endpoint returned no token');
  });
});
