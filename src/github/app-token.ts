/**
 * Fetch a short-lived, repo-scoped GitHub App token from the ReviewAlly minter.
 * The workflow's GITHUB_TOKEN authenticates the request; the minter verifies it
 * against the requested repo before minting.
 */

interface MintResponse {
  token?: string;
  expires_at?: string;
  error?: string;
}

export interface AppToken {
  token: string;
  expiresAt?: string;
}

export async function fetchAppToken(
  endpoint: string,
  workflowToken: string,
  repo: string,
): Promise<AppToken> {
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
    });
  } catch (err) {
    throw new Error(`could not reach app-token endpoint: ${(err as Error).message}`);
  }

  const body = (await res.json().catch(() => ({}))) as MintResponse;

  if (!res.ok) {
    throw new Error(body.error ? `${res.status}: ${body.error}` : `HTTP ${res.status}`);
  }
  if (!body.token) {
    throw new Error('endpoint returned no token');
  }
  return { token: body.token, expiresAt: body.expires_at };
}
