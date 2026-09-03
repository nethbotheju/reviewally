import * as core from '@actions/core';
import { getOctokit } from '@actions/github';
import { getInputs } from './config/inputs';
import { resolveTrigger } from './github/trigger';
import { fetchAppToken, AppNotInstalledError } from './github/app-token';
import {
  fetchFileContents,
  fetchPullRequest,
  fetchChangedFiles,
  postReview,
  reactToComment,
} from './github/api';
import { buildAgentSystemPrompt, buildSystemPrompt, buildUserPrompt } from './shared/prompt';
import { parseReview } from './shared/parse';
import { formatNoChanges, formatReview } from './shared/format';
import { runStandardReview } from './modes/standard/runner';
import { createModel } from './modes/standard/models';
import { runAgentReview } from './modes/agent/runner';
import {
  prepareRepoSnapshot,
  buildRepoTree,
  cleanupRepoSnapshot,
  RepoTooLargeError,
} from './modes/agent/snapshot';
import type { ActionInputs, RepoRoot } from './config/types';

async function run(): Promise<void> {
  let repoRoot: RepoRoot | undefined;

  try {
    const inputs = getInputs();
    core.setSecret(inputs.apiKey);

    const trigger = resolveTrigger(inputs);
    if (!trigger.run || !trigger.review) {
      core.info(`Skipping: ${trigger.reason}`);
      return;
    }

    const { owner, repo, pullNumber, commentId } = trigger.review;

    // Branded bot: swap the workflow identity for the ReviewAlly App identity
    // when a minter endpoint is configured. Falls back gracefully.
    let githubToken = inputs.githubToken;
    if (inputs.appTokenUrl) {
      try {
        const appToken = await fetchAppToken(
          inputs.appTokenUrl,
          inputs.githubToken,
          `${owner}/${repo}`,
        );
        core.setSecret(appToken.token);
        githubToken = appToken.token;
        core.info(`Using ReviewAlly app token (expires ${appToken.expiresAt ?? 'soon'}).`);
      } catch (err) {
        if (err instanceof AppNotInstalledError) {
          core.info(
            `ReviewAlly app is not installed on ${owner}/${repo} — install it at https://github.com/apps/reviewally for branded reviews. Posting as the default workflow identity.`,
          );
        } else {
          core.warning(
            `Branded bot unavailable (${(err as Error).message}); this looks like a minter or configuration issue rather than a missing installation — check app-token-url. Posting as the default workflow identity.`,
          );
        }
      }
    }

    const octokit = getOctokit(githubToken);

    if (commentId) await reactToComment(octokit, owner, repo, commentId, 'eyes');

    const pr = await fetchPullRequest(octokit, owner, repo, pullNumber);
    core.info(`Reviewing PR #${pullNumber}: ${pr.title}`);

    const fetchResult = await fetchChangedFiles(octokit, owner, repo, pullNumber, inputs);
    if (fetchResult.files.length === 0) {
      await postReview(octokit, owner, repo, pullNumber, pr.headSha, formatNoChanges(), []);
      core.info('No reviewable changes; posted a skip notice.');
      if (commentId) await reactToComment(octokit, owner, repo, commentId, 'rocket');
      return;
    }

    const contextDocs = await fetchFileContents(
      octokit,
      owner,
      repo,
      pr.headSha,
      inputs.contextDocs,
      {
        maxBytes: 10000,
        maxFiles: 3,
      },
    );

    // Whether we actually run agent mode (may degrade if tarball is too large)
    let useAgent = inputs.reviewMode === 'agent';

    if (useAgent) {
      try {
        repoRoot = await prepareRepoSnapshot(
          octokit,
          owner,
          repo,
          pr.headSha,
          inputs.agentTarballMaxMb,
        );
      } catch (err) {
        if (err instanceof RepoTooLargeError) {
          core.warning(err.message);
          useAgent = false;
        } else {
          throw err;
        }
      }
    }

    // Build prompts
    const tree = useAgent && repoRoot ? buildRepoTree(repoRoot.path, inputs) : undefined;
    const promptInputs: ActionInputs = useAgent ? inputs : { ...inputs, reviewMode: 'standard' };
    const systemPrompt = useAgent
      ? buildAgentSystemPrompt(promptInputs)
      : buildSystemPrompt(promptInputs);
    const userPrompt = buildUserPrompt(
      pr,
      fetchResult.files,
      { docs: contextDocs, tree },
      useAgent,
    );

    // Run review
    const reviewResult =
      useAgent && repoRoot
        ? await runAgentReview(systemPrompt, userPrompt, repoRoot, inputs)
        : await runStandardReview(createModel(inputs), systemPrompt, userPrompt);

    core.info(
      `Review done. tokens in=${reviewResult.inputTokens} out=${reviewResult.outputTokens} tot=${reviewResult.totalTokens} steps=${reviewResult.steps}`,
    );

    // Parse, format, post
    const doc = parseReview(reviewResult.text);
    const body = formatReview(doc, fetchResult.files);
    await postReview(octokit, owner, repo, pullNumber, pr.headSha, body, []);
    core.setOutput('summary', doc.solution || doc.background);

    core.info('Posted review.');
    if (commentId) await reactToComment(octokit, owner, repo, commentId, '+1');
  } catch (err) {
    const e = err as Error;
    core.setFailed(`AI code review failed: ${e.message}${e.stack ? `\n${e.stack}` : ''}`);
  } finally {
    if (repoRoot) {
      try {
        cleanupRepoSnapshot(repoRoot);
      } catch {
        /* best-effort */
      }
    }
  }
}

run();
