# ReviewAlly Token Minter

A ~200-line Cloudflare Worker that turns the ReviewAlly GitHub App into a
**zero-configuration branded bot**. It holds the App's private key (as a Worker
secret) and mints short-lived, repo-scoped installation tokens on demand, so
consumers never copy `APP_ID` / `APP_PRIVATE_KEY` secrets into their repos —
they just install the App.

```
consumer workflow ──workflow token──▶ /token ──▶ repo-scoped ReviewAlly token (1h)
```

## Deploy (one time, ~5 minutes)

1. Install wrangler and log in:

   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. From this directory, deploy:

   ```bash
   wrangler deploy
   ```

3. Set the secrets (values from the ReviewAlly App settings page):

   ```bash
   wrangler secret put APP_ID                    # numeric App ID
   wrangler secret put GITHUB_APP_PRIVATE_KEY     # full contents of the .pem file
   ```

4. Your endpoint is `https://api.reviewally.nethbotheju.dev/token` (custom domain, already
   configured in `wrangler.toml`) or `https://reviewally-minter.<account>.workers.dev/token`
   (the default workers.dev subdomain). The plain `reviewally.nethbotheju.dev` is left
   free for a future ReviewAlly website.

5. Make sure the GitHub App is **public** and installable by any account:
   App settings → *Advanced* → "Make this GitHub App public", and
   *Install* → "Any account".

6. Flip the action default (optional, recommended once the minter is live):
   in `action.yml`, set `app-token-url`'s default to your endpoint URL. Every
   consumer then gets the branded bot with **zero extra config** — reviews
   silently fall back to the workflow identity on repos where the App isn't
   installed.

## Test it

```bash
curl -X POST https://api.reviewally.nethbotheju.dev/token \
  -H "Authorization: Bearer $SOME_REPO_WORKFLOW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"repo": "owner/name"}'
```

## Security model

- The private key never leaves the Worker's secret store; the action bundle
  contains no credentials.
- Minted tokens are **scoped to a single repository**, carry only
  `contents: read`, `pull_requests: write`, `issues: write`, and expire in
  **1 hour**.
- The caller must present a GitHub token that is valid for the requested repo
  (the action sends the run's `GITHUB_TOKEN`), and the App must be installed
  on that repo — otherwise no token is minted.
- Best-effort per-repo rate limiting (30 mints/hour) complements GitHub's own
  throttling.
- Residual risk (shared by all public App-token minters): anyone with read
  access to a repo where ReviewAlly is installed could mint a PR-scoped token
  for that repo. The scoped permissions and short TTL bound what that token
  can do (post reviews/comments on that repo only). If this matters to you,
  keep the minter URL private and pass it per-consumer instead of defaulting
  it in `action.yml`.

## Cost

Well within Cloudflare Workers' free tier for realistic review volumes
(100k requests/day).
