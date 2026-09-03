<div align="center">
  <img src="images/robot-mascot-squircle.png" alt="ReviewAlly mascot" width="140" />
  <h1>ReviewAlly</h1>
  <p><strong>AI Code Review GitHub Action</strong></p>
</div>

A reusable GitHub Action that performs **AI-powered code review on pull requests**.
Bring your own key (BYOK) and choose your model — OpenAI, any OpenAI-compatible
endpoint (OpenRouter, Together, Ollama, vLLM, LM Studio…), or Anthropic.

It runs on demand: add the **`ai-review`** label to a PR, or comment **`/ai-review`**.
It reads the PR diff via the GitHub API, asks the model to review it, and posts the
result back as a **PR review with inline line comments** plus a summary — never blocking.

> This repository **is** the action. Other projects consume it with `uses:`.

---

## Quick start (consumer project)

1. Add the workflow below to your repo at `.github/workflows/ai-code-review.yml`
   (also available in [`examples/workflow.yml`](./examples/workflow.yml)).
2. Replace `your-org/ai-code-review` with the real reference and pin it (e.g. `@v1`).
3. Edit config (`api-type`, `model`, `base-url`) directly in the workflow file.
4. Add **one** repository secret for the API key (everything else is plain config, not a secret):

   | Secret | Required | Example |
   | --- | --- | --- |
   | `AI_CODE_REVIEW_LLM_API_KEY` | yes | your provider API key |

```yaml
name: ai-code-review
on:
  pull_request:
    types: [opened, reopened, synchronize, labeled]
  issue_comment:
    types: [created]

concurrency:
  group: ai-review-${{ github.event.pull_request.number || github.event.issue.number }}
  cancel-in-progress: false

jobs:
  review:
    if: |
      (github.event_name == 'pull_request' &&
        (github.event.action != 'labeled' || github.event.label.name == 'ai-review'))
      || (github.event_name == 'issue_comment' &&
        startsWith(github.event.comment.body, '/ai-review') &&
        github.event.issue.pull_request != null)
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: nethbotheju/ai-code-review@v1
        with:
          api-type: openai            # openai | openai-chat-compatible | anthropic
          model: gpt-4o               # your model
          # base-url: 'https://opencode.ai/zen/go/v1'   # set ONLY for openai-chat-compatible
          api-key: ${{ secrets.AI_CODE_REVIEW_LLM_API_KEY }}
          # auto-review: 'true'           # review on open/reopen/push automatically
          # extra-instructions: '...'
```

Then add the **`ai-review`** label to a PR, or comment **`/ai-review`**.

> **Forked PRs:** by default the workflow token is read-only on PRs from forks.
> To review those, switch the `pull_request` trigger to `pull_request_target`.

---

## How it works (no cloning required)

- **GitHub access is automatic.** The runner injects `GITHUB_TOKEN`; the action uses
  it to read the PR and post the review. The only required permission is
  `pull-requests: write` (and `contents: read`).
- The action resolves the PR from the event (label, slash command, or open/push when
  `auto-review` is on), fetches the changed files and their diffs through the REST API,
  and **never clones the repo**.
- The diff is annotated with new-file line numbers so the model can cite accurate lines.
- Output is posted as a single PR review: a structured document (background, proposed
  solution, a file-change table, verification notes, and high-level recommendations).

---

## Optional: post as a branded bot (custom name & avatar)

By default the review is posted with the workflow's `GITHUB_TOKEN`, so it shows as
`github-actions[bot]` with the GitHub logo — **no extra setup required**.

For a custom name and logo (like CodeRabbit), the identity must come from a token
that carries one — the default `GITHUB_TOKEN` always renders as `github-actions[bot]`
(a GitHub platform rule, not an action limitation).

### Recommended — install the ReviewAlly App (zero secrets)

1. Install the **ReviewAlly** GitHub App on your repo or org.
2. Add one input to the workflow:

```yaml
    - uses: nethbotheju/ai-code-review@v1
      with:
        app-token-url: https://api.reviewally.nethbotheju.dev/token
        # ...your other inputs
```

No `APP_ID`, no `APP_PRIVATE_KEY`, no PAT. The action exchanges its own workflow
token for a short-lived (1 hour), **repo-scoped** ReviewAlly token and posts the
review as `reviewally[bot]` with the ReviewAlly logo. If the App is not installed
on the repo, the action logs a warning and falls back to the default identity
instead of failing. The minter is open source in [`minter/`](./minter/README.md) —
you can deploy your own instance if you prefer not to depend on the published one.

### Advanced — bring your own identity

Both options below also work; they just move the key handling into your repo
secrets. The identity comes entirely from the token passed to `github-token`:

#### Option A — GitHub App (recommended for branding)

1. Create a GitHub App: set a name + logo, grant **Pull requests: Read & write**,
   **Contents: Read**, **Issues: Read & write**. Leave the webhook off and subscribe to
   no events (the workflow still triggers the action; the App only provides identity).
2. Install the App on the repo(s).
3. Add secrets `APP_ID` and `APP_PRIVATE_KEY` (the full `.pem` file contents).
4. Mint a token and pass it as `github-token`:

```yaml
    steps:
      - id: app-token
        uses: actions/create-github-app-token@v1
        with:
          app-id: ${{ secrets.APP_ID }}
          private-key: ${{ secrets.APP_PRIVATE_KEY }}
      - uses: nethbotheju/ai-code-review@v1
        with:
          github-token: ${{ steps.app-token.outputs.token }}
          # ...your other inputs
```

Reviews post as `<your-app-slug>[bot]` with your logo.

### Option B — bot user + PAT (simpler, one secret)

Create a GitHub user whose avatar is your logo, generate a PAT, store it as
`REVIEW_BOT_TOKEN`, and pass it as `github-token`:

```yaml
    - uses: nethbotheju/ai-code-review@v1
      with:
        github-token: ${{ secrets.REVIEW_BOT_TOKEN }}
        # ...your other inputs
```

A complete ready-to-paste branded workflow is in
[`examples/workflow-branded.yml`](./examples/workflow-branded.yml).

> GitHub only renders a custom name/avatar for tokens that carry a custom identity
> (an App or a PAT); the default `GITHUB_TOKEN` cannot be branded. This is a GitHub
> limitation, not the action.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `api-type` | yes | — | `openai` \| `openai-chat-compatible` \| `anthropic` |
| `api-key` | yes | — | LLM API key (store in a secret) |
| `base-url` | only `openai-chat-compatible` | provider default | API base URL override |
| `model` | yes | — | Model identifier |
| `github-token` | no | `${{ github.token }}` | Token for reading the PR and posting the review |
| `app-token-url` | no | — | ReviewAlly token-minter endpoint; posts as `reviewally[bot]` with zero consumer secrets (see [Branded bot](#optional-post-as-a-branded-bot-custom-name--avatar)) |
| `trigger-comment` | no | `/ai-review` | Slash command that triggers a review |
| `trigger-label` | no | `ai-review` | Label that triggers a review |
| `auto-review` | no | `false` | Also review on PR open/reopen/push |
| `max-files` | no | `20` | Max changed files reviewed per run |
| `max-diff-lines` | no | `3000` | Max total added lines reviewed per run |
| `exclude-patterns` | no | — | Extra glob excludes (comma/newline separated) |
| `use-default-excludes` | no | `true` | Apply built-in excludes for lockfiles, minified files, and sourcemaps. Build artifacts, dependencies, and VCS metadata are always excluded. |
| `extra-instructions` | no | — | Extra guidance appended to the prompt |
| `review-mode` | no | `standard` | Review mode: `standard` (single prompt) or `agent` (pi-powered investigation loop) |
| `agent-tarball-max-mb` | no | `200` | Max tarball size in MB for the repo snapshot (larger repos degrade to standard mode) |
| `context-docs` | no | `AGENTS.md,.ai-review.md,CONTRIBUTING.md` | Markdown doc files to include from the repo root for project guidance |
| `pi-version` | no | `0.82.1` | Version of `@earendil-works/pi-coding-agent` to install for agent mode |
| `pi-timeout-ms` | no | `600000` | Hard timeout (ms) for an agent-mode review run |

## Outputs

| Output | Description |
| --- | --- |
| `summary` | Plain-text review summary from the model |

## Review format

The review is posted as a single, structured document:

- **Issue / Background** — what the change addresses and why.
- **Proposed Solution** — assessment of the implementation approach.
- **Summary of File Changes** — a per-file table (path, change type, description).
- **Recommendations** — high-level suggestions only (Security / Edge Case / Performance /
  Refactoring Tip). Trivial nits (missing comments/tests, style) are intentionally excluded.
- Closes with a small `_Automated review using ReviewAlly._` watermark.
- The review is always **non-blocking** (`COMMENT` event).

## Agent mode (`review-mode: agent`)

When `review-mode` is `agent`, the action downloads the full repo at the PR head
as a tarball (one API call) and spawns [`@earendil-works/pi-coding-agent`](https://github.com/earendil-works/pi)
headless with read-only tools (`read`, `grep`, `find`, `ls`) to investigate the
codebase before making recommendations. This uses pi's battle-tested loop
(compaction, retries, parallel tool execution).

Pi is installed on the runner via `npm install` (~170MB) on each run; the
install only takes a few seconds, so no caching is required. The API key is
passed via environment variable (never in argv),
`openai-chat-compatible` endpoints are configured via an ephemeral `models.json`, and
a hard `pi-timeout-ms` guards against runaway loops (pi has no built-in step
cap). See [`examples/workflow-agent.yml`](./examples/workflow-agent.yml)
for a complete example.

The model verifies whether a potential issue truly exists and confirms that a
fix hasn't already been implemented elsewhere before writing a recommendation.

**Model recommendation:** Agent mode needs a capable model that can use tools
effectively — Claude Sonnet (`claude-sonnet-4-5`) or GPT-4o class. Smaller/cheaper
models may loop poorly or produce incorrect tool calls.

**Security note:** Agent mode spawns pi with read-only tools (`read`, `grep`, `find`,
`ls`) — no shell, no write, no network, so it cannot mutate the repo or exfiltrate
data. The API key is injected via environment variable, never exposed in the
process arguments. The repo snapshot stays on the runner in a temp directory and
is deleted after the review completes.

**Fallback:** If the repo tarball exceeds `agent-tarball-max-mb`, the action
automatically degrades to standard mode (a single direct LLM call) with a warning.

## Development

```bash
npm install
npm run typecheck   # type-check
npm run bundle      # bundle to dist/index.js (committed)
```

`dist/` is committed because GitHub Actions run it directly. The CI workflow verifies
that `dist/` is up to date on every PR.

### Releasing

Tag a release and keep a moving major tag (`v1`) pointing at the latest commit on
that major, so consumers can pin `@v1` while receiving patch updates.

## Roadmap

1. **Reduce per-consumer setup for branded bots.** Branding now works with zero
   secrets via the hosted token minter (`minter/`, `app-token-url`). Remaining:
   a fully hosted (webhook) mode where consumers click **Install** with no workflow
   file at all — the App would receive events directly and run centrally.
- Retry on transient provider errors (e.g. HTTP 5xx).
- `generateObject` for typed final output (replace fragile JSON parsing).
- Search tool with MCP integration for richer codebase queries.

## License

MIT
