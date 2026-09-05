import { jsonrepair } from 'jsonrepair';
import { truncate } from './util';
import type { FileDescription, Recommendation, ReviewDocument } from '../shared/types';

export function parseReview(raw: string, options: { onRepair?: () => void } = {}): ReviewDocument {
  const text = extractJson(raw);
  const { value, repaired } = parseLenient(text);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    const kind =
      typeof value === 'object' ? (Array.isArray(value) ? 'array' : 'null') : typeof value;
    throw new Error(
      `Model response was not a JSON object: ${kind}. Model response was:\n${truncate(raw, 400)}`,
    );
  }
  const obj = value as Record<string, unknown>;

  const doc = {
    background: asString(obj.background),
    solution: asString(obj.solution),
    files: asFileDescriptions(obj.files),
    recommendations: asRecommendations(obj.recommendations),
  };

  // Repair passes can legitimize input that carries no review content at all;
  // posting a placeholder-only review would hide the failure.
  if (
    !doc.background &&
    !doc.solution &&
    doc.files.length === 0 &&
    doc.recommendations.length === 0
  ) {
    throw new Error(
      `Model response contained no review content. Model response was:\n${truncate(raw, 400)}`,
    );
  }
  // Fire only once a repaired doc has passed validation and will be posted.
  if (repaired) options.onRepair?.();
  return doc;
}

function extractJson(raw: string): string {
  let text = raw.trim();

  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fence && fence[1] !== undefined) text = fence[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) text = text.slice(start, end + 1);
  return text;
}

function stripTrailingCommas(text: string): string {
  return text.replace(/,(\s*[}\]])/g, '$1');
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

function parseLenient(text: string): { value: unknown; repaired: boolean } {
  let lastError: unknown;
  for (const candidate of [text, stripComments(stripTrailingCommas(text))]) {
    try {
      return { value: JSON.parse(candidate), repaired: false };
    } catch (err) {
      lastError = err;
    }
  }
  // Last resort: let jsonrepair recover near-JSON (single quotes, unquoted
  // keys, truncation) that the cheap passes above miss.
  try {
    return { value: JSON.parse(jsonrepair(text)), repaired: true };
  } catch (err) {
    lastError = err;
  }
  const p = truncate(text, 400);
  throw new Error(
    `Could not parse model response as JSON (${(lastError as Error).message}). Model response was:\n${p}`,
  );
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asFileDescriptions(value: unknown): FileDescription[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const f = item as Record<string, unknown>;
      const path = typeof f.path === 'string' ? f.path.trim() : '';
      const description = typeof f.description === 'string' ? f.description.trim() : '';
      if (!path) return null;
      return { path, description };
    })
    .filter((x): x is FileDescription => x !== null);
}

function asRecommendations(value: unknown): Recommendation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const r = item as Record<string, unknown>;
      const note = typeof r.note === 'string' ? r.note.trim() : '';
      if (!note) return null;
      const category =
        typeof r.category === 'string' && r.category.trim() ? r.category.trim() : 'Suggestion';
      return { category, note };
    })
    .filter((x): x is Recommendation => x !== null);
}
