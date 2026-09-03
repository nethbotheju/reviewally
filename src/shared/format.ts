import type { ChangedFile, ReviewDocument } from '../shared/types';

const CHANGE_TYPE: Record<string, string> = {
  added: 'Added',
  modified: 'Modified',
  removed: 'Removed',
  renamed: 'Renamed',
  copied: 'Copied',
  changed: 'Changed',
};

export function formatReview(doc: ReviewDocument, files: ChangedFile[]): string {
  const out: string[] = [];

  out.push('### Issue / Background', '');
  out.push(doc.background.trim() || '_No background provided._', '');

  out.push('### Proposed Solution', '');
  out.push(doc.solution.trim() || '_No solution assessment provided._', '');

  out.push('## Summary of File Changes', '');
  out.push('| File Path | Change Type | Description |');
  out.push('| :--- | :--- | :--- |');
  const descriptions = new Map(doc.files.map((f) => [f.path, f.description]));
  for (const f of files) {
    const changeType = CHANGE_TYPE[f.status] ?? capitalize(f.status);
    const description =
      descriptions.get(f.filename)?.trim() ||
      `${f.additions} addition(s), ${f.deletions} deletion(s)`;
    out.push(`| \`${f.filename}\` | ${changeType} | ${cell(description)} |`);
  }
  out.push('');

  out.push('## Recommendations', '');
  if (doc.recommendations.length === 0) {
    out.push('_No high-level recommendations; the change looks solid._');
  } else {
    for (const r of doc.recommendations) {
      out.push(`- **[${r.category}]:** ${inline(r.note)}`);
    }
  }
  out.push('');

  out.push('---', '_Automated review using ReviewAlly._');

  return out.join('\n');
}

export function formatNoChanges(): string {
  return [
    '### Issue / Background',
    '',
    'No reviewable code changes were found (only excluded, generated, deleted, or binary files).',
    '',
    '---',
    '_Automated review using ReviewAlly._',
  ].join('\n');
}

function cell(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

function inline(text: string): string {
  return text.replace(/\r?\n/g, ' ').trim();
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Modified';
}
