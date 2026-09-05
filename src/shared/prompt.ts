import type { ActionInputs } from '../config/types';
import type { ChangedFile } from '../shared/types';
import { truncate } from '../shared/util';

interface PullRequestLike {
  number: number;
  title: string;
  body: string | null;
}

export function buildSystemPrompt(inputs: ActionInputs): string {
  const base = `You are a senior software engineer reviewing a GitHub pull request.
Produce a clear, professional, high-level review.

Your ENTIRE response must be a single JSON object with exactly this schema, wrapped in one fenced json code block — no markdown, code, or text before or after the block:

Use exactly this response template:

\`\`\`json
{
  "background": "1-3 sentences: what this change addresses and why it is needed (your understanding of the PR's intent).",
  "solution": "1-3 sentences: assessment of the implementation approach taken.",
  "files": [
    { "path": "<exact path from the diff>", "description": "concise description of what changed in this file" }
  ],
  "recommendations": [
    { "category": "Security | Edge Case | Performance | Refactoring Tip", "note": "a substantive, high-level suggestion" }
  ]
}
\`\`\`

JSON syntax rules (strict):
- Use double quotes (") for every key and string value — never single quotes (').
- No trailing commas and no comments.
- Escape double quotes inside strings as \\" and use \\n for line breaks; never put a raw line break inside a string.

Rules:
- Be concise and high-level. Do not restate the diff.
- "recommendations" must contain ONLY substantive, actionable, high-level items: real security risks, meaningful edge cases, performance issues, critical-path test coverage gaps, or genuine refactoring opportunities.
- EXCLUDE trivial noise: never mention missing or extra comments, code-style preferences, or obvious restatements. If there is nothing substantive, return an empty "recommendations" array.
- "files" should cover the key changed files with concise descriptions and exact paths.
- Your entire response must be valid JSON inside a single fenced json code block — nothing else.`;

  if (!inputs.extraInstructions) return base;
  return `${base}\n\nAdditional review instructions from the project:\n${inputs.extraInstructions}`;
}

/**
 * Full system prompt for agent mode, built on pi's default agent-harness
 * structure (persona → Available tools → Guidelines → Output) but specialized
 * for PR review.
 */
export function buildAgentSystemPrompt(inputs: ActionInputs): string {
  const persona = `You are an expert coding assistant operating inside pi, a coding agent harness. In this session your task is to review a GitHub pull request: understand the change, investigate the surrounding code with your read-only tools, verify every concern by reading the relevant files, and report a concise, high-level assessment.

Available tools:
- read: Read file contents
- grep: Search file contents for patterns (respects .gitignore)
- find: Find files by glob pattern (respects .gitignore)
- ls: List directory contents

You have read-only tools only — you cannot create, edit, or delete files.

Guidelines:
- Use read to examine files instead of cat or sed.
- Before raising any issue, verify it by reading the relevant file. Do not report a problem you have not confirmed in the code.
- Be concise and high-level. Do not restate the diff.
- Show file paths clearly when referencing files.`;

  const output = `Output format:

Your FINAL response must be a single JSON object with exactly this schema, wrapped in one fenced json code block — no markdown, code, or text before or after the block:

Use exactly this response template:

\`\`\`json
{
  "background": "1-3 sentences: what this change addresses and why (your understanding of the PR's intent).",
  "solution": "1-3 sentences: assessment of the implementation approach taken.",
  "files": [
    { "path": "<exact path from the diff>", "description": "concise description of what changed in this file" }
  ],
  "recommendations": [
    { "category": "Security | Edge Case | Performance | Refactoring Tip", "note": "a substantive, actionable, verified suggestion" }
  ]
}
\`\`\`

JSON syntax rules (strict):
- Use double quotes (") for every key and string value — never single quotes (').
- No trailing commas and no comments.
- Escape double quotes inside strings as \\" and use \\n for line breaks; never put a raw line break inside a string.

Rules:
- "recommendations": ONLY substantive, verified items — real security risks, meaningful edge cases, performance issues, or genuine refactors. Use an empty array if there is nothing substantive.
- Never mention code-style, missing/extra comments, or trivial restatements of the diff.
- "files": the key changed files, using exact paths from the diff.
- Your final response must be valid JSON inside a single fenced json code block — nothing else.`;

  const sections = [persona];
  if (inputs.extraInstructions) {
    sections.push(`Additional review instructions from the project:\n${inputs.extraInstructions}`);
  }
  sections.push(output);
  return sections.join('\n\n');
}

export interface PromptContext {
  docs?: string;
  tree?: string;
}

export function buildUserPrompt(
  pr: PullRequestLike,
  files: ChangedFile[],
  ctx?: PromptContext,
  isAgent = false,
): string {
  const parts: string[] = [];
  if (isAgent) {
    parts.push(
      'Review the pull request below. Investigate the repository with your tools as needed, verify any concern in the code, then respond with ONLY the JSON review object described in your instructions, wrapped in its json code fence.',
    );
    parts.push('');
  }
  parts.push(`# Pull Request #${pr.number}: ${pr.title}`);
  if (pr.body && pr.body.trim()) {
    parts.push('');
    parts.push('## Description');
    parts.push(truncate(pr.body.trim(), 2000));
  }

  if (ctx?.tree) {
    parts.push('');
    parts.push('## Repository Layout');
    parts.push('Below is the file tree of the repository (key files and directories):');
    parts.push('```');
    parts.push(ctx.tree);
    parts.push('```');
  }

  if (ctx?.docs) {
    parts.push('');
    parts.push('## Project Guidance');
    parts.push('The following project documentation files provide context and conventions:');
    parts.push(ctx.docs);
  }

  parts.push('');
  parts.push(`## Changed files (${files.length})`);
  parts.push('Below are the changed files and their diffs.');
  parts.push('');
  for (const file of files) {
    parts.push(renderFile(file));
    parts.push('');
  }
  return parts.join('\n');
}

function renderFile(file: ChangedFile): string {
  const out: string[] = [];
  out.push(`### ${file.filename}  (+${file.additions} -${file.deletions}, ${file.status})`);
  out.push('```diff');
  for (const line of file.lines) {
    if (line.type === 'add') {
      out.push(`+${pad(line.newLine)} ${line.content}`);
    } else if (line.type === 'delete') {
      out.push(`-${pad()} ${line.content}`);
    } else {
      out.push(` ${pad(line.newLine)} ${line.content}`);
    }
  }
  out.push('```');
  return out.join('\n');
}

function pad(n?: number): string {
  return (n ?? '').toString().padStart(5, ' ');
}
