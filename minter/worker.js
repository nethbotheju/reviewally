// ReviewAlly token minter.
// Holds the ReviewAlly GitHub App private key (as a Worker secret) and mints
// short-lived, repo-scoped installation tokens for the action, so consumers
// never need APP_ID / APP_PRIVATE_KEY secrets.
//
// POST /token
//   Authorization: Bearer <workflow GITHUB_TOKEN of the calling run>
//   { "repo": "owner/name" }
// -> 200 { "token": "...", "expires_at": "..." }
// -> 401 token not valid for that repo
// -> 404 ReviewAlly is not installed on that repo

const API = 'https://api.github.com';
const TOKEN_TTL_SECONDS = 3600;
const PER_REPO_HOURLY_LIMIT = 30;

let cachedKey = null;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/token') {
      return reply(405, { error: 'POST /token only' });
    }

    const workflowToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!workflowToken) return reply(401, { error: 'missing bearer token' });

    let repo = '';
    try {
      repo = String(((await request.json()) || {}).repo || '');
    } catch {
      /* fall through to validation below */
    }
    if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
      return reply(400, { error: 'invalid repo; expected "owner/name"' });
    }

    if (!rateLimit(repo)) return reply(429, { error: 'rate limit exceeded, retry later' });

    // Validate the caller's workflow token can actually access this repo.
    const check = await gh(`/repos/${repo}`, `Bearer ${workflowToken}`);
    if (check.status !== 200) {
      console.error(`repo validation failed with ${check.status}`);
      return reply(401, { error: 'token is not valid for this repo' });
    }

    let jwt;
    try {
      jwt = await appJwt(env);
    } catch (e) {
      console.error(`key import failed: ${e.message}`);
      return reply(500, { error: 'bad GITHUB_APP_PRIVATE_KEY: ' + e.message });
    }

    const inst = await gh(`/repos/${repo}/installation`, `Bearer ${jwt}`);
    if (inst.status !== 200) {
      return reply(404, { error: 'ReviewAlly is not installed on this repo' });
    }
    const installationId = (await inst.json()).id;

    const name = repo.split('/')[1];
    const mint = await fetch(`${API}/app/installations/${installationId}/access_tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'reviewally-minter',
      },
      body: JSON.stringify({
        repositories: [name],
        permissions: { contents: 'read', pull_requests: 'write', issues: 'write' },
      }),
    });
    if (!mint.ok) {
      console.error(`mint failed: ${mint.status}`);
      return reply(502, { error: 'failed to mint installation token' });
    }
    const out = await mint.json();
    return reply(200, { token: out.token, expires_at: out.expires_at });
  },
};

async function gh(path, auth) {
  return fetch(`${API}${path}`, {
    headers: {
      Authorization: auth,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'reviewally-minter',
    },
  });
}

function reply(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// Best-effort per-isolate rate limit (Worker isolates are ephemeral; this
// complements GitHub's own throttling, not a hard guarantee).
const hits = new Map();
function rateLimit(repo) {
  const now = Date.now();
  for (const [k, t] of hits) if (now - t[0] > 3_600_000) hits.delete(k);
  const t = hits.get(repo) || [now, 0];
  t[1] += 1;
  hits.set(repo, t);
  return t[1] <= PER_REPO_HOURLY_LIMIT;
}

async function appJwt(env) {
  const appId = env.APP_ID;
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 180, iss: appId }));
  const data = `${header}.${payload}`;
  const key = await importKey(env.GITHUB_APP_PRIVATE_KEY);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, bytes(data));
  return `${data}.${b64urlBytes(sig)}`;
}

async function importKey(pem) {
  if (cachedKey) return cachedKey;
  const b64 = pem
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/, '')
    .replace(/-----END [A-Z ]*PRIVATE KEY-----/, '')
    .replace(/[\s\r\n]+/g, '');
  if (!b64) throw new Error('no PEM body found — was the full file pasted?');
  let raw;
  try {
    raw = atob(b64);
  } catch {
    throw new Error('key body is not valid base64 — stray characters in the paste');
  }
  if (raw.length < 100) {
    throw new Error(`key body too short (${raw.length} chars) — paste is truncated`);
  }
  const der = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  try {
    cachedKey = await crypto.subtle.importKey(
      'pkcs8',
      toPkcs8(der),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch {
    throw new Error('key structure rejected — content is malformed or mixed up');
  }
  return cachedKey;
}

// GitHub App keys ship as either PKCS#8 ("BEGIN PRIVATE KEY") or PKCS#1
// ("BEGIN RSA PRIVATE KEY"); WebCrypto only imports PKCS#8, so wrap PKCS#1.
const PKCS8_ALG_PREFIX = [
  0x02, 0x01, 0x00, 0x30, 0x0d, 0x06, 0x09,
  0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
];

function derLen(n) {
  if (n < 0x80) return [n];
  const bytes = [];
  let x = n;
  while (x > 0) {
    bytes.unshift(x & 0xff);
    x >>= 8;
  }
  return [0x80 | bytes.length, ...bytes];
}

function tlv(tag, content) {
  return [tag, ...derLen(content.length), ...content];
}

function toPkcs8(der) {
  const looksPkcs8 = PKCS8_ALG_PREFIX.every((b, i) => der[i + 4] === b);
  if (looksPkcs8) return der;
  const inner = [
    0x02, 0x01, 0x00, // version 0
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00, // rsaEncryption
    ...tlv(0x04, [...der]), // OCTET STRING wrapping the RSAPrivateKey
  ];
  return new Uint8Array(tlv(0x30, inner));
}

function bytes(s) {
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function b64url(s) {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlBytes(buf) {
  let bin = '';
  const arr = new Uint8Array(buf);
  for (const b of arr) bin += String.fromCharCode(b);
  return b64url(bin);
}
