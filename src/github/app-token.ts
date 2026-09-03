/**
 * Fetch a short-lived, repo-scoped GitHub App token from the ReviewAlly minter.
 * The workflow's GITHUB_TOKEN authenticates the request; the minter verifies it
 * against the requested repo before minting.
 */

const FETCH_TIMEOUT_MS = 10_000;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const MAX_ATTEMPTS = 2;

interface MintResponse {
  token?: string;
  expires_at?: string;
  error?: string;
}

export interface AppToken {
  token: string;
  expiresAt?: string;
}

/** The minter responded 404: the ReviewAlly App is not installed on the repo. */
export class AppNotInstalledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppNotInstalledError';
  }
}

export async function fetchAppToken(
  endpoint: string,
  workflowToken: string,
  repo: string,
): Promise<AppToken> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${workflowToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'reviewally-action',
        },
        body: JSON.stringify({ repo }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      lastError = new Error(`could not reach app-token endpoint: ${(err as Error).message}`);
      continue;
    }

    const body = (await res.json().catch(() => ({}))) as MintResponse;

    if (!res.ok) {
      const msg = body.error ? `${res.status}: ${body.error}` : `HTTP ${res.status}`;
      if (res.status === 404) throw new AppNotInstalledError(msg);
      if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_ATTEMPTS) {
        lastError = new Error(msg);
        continue;
      }
      throw new Error(msg);
    }
    if (!body.token) {
      throw new Error('endpoint returned no token');
    }
    return { token: body.token, expiresAt: body.expires_at };
  }

  throw lastError ?? new Error('app-token fetch failed');
}
