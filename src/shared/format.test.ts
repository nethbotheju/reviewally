import { describe, it, expect } from 'vitest';
import { formatNoChanges, formatRepairWarning, formatReview } from './format';
import type { ChangedFile, ReviewDocument } from './types';

const file = (overrides: Partial<ChangedFile> = {}): ChangedFile => ({
  filename: 'src/a.ts',
  status: 'modified',
  additions: 2,
  deletions: 1,
  lines: [],
  ...overrides,
});

const doc = (overrides: Partial<ReviewDocument> = {}): ReviewDocument => ({
  background: 'Why',
  solution: 'How',
  files: [],
  recommendations: [],
  ...overrides,
});

describe('formatReview', () => {
  it('renders all sections', () => {
    const out = formatReview(
      doc({
        files: [{ path: 'src/a.ts', description: 'Added helper' }],
        recommendations: [{ category: 'Security', note: 'Validate input' }],
      }),
      [file()],
    );
    expect(out).toContain('### Issue / Background');
    expect(out).toContain('Why');
    expect(out).toContain('### Proposed Solution');
    expect(out).toContain('How');
    expect(out).toContain('## Summary of File Changes');
    expect(out).toContain('`src/a.ts`');
    expect(out).toContain('Added helper');
    expect(out).toContain('## Recommendations');
    expect(out).toContain('**[Security]:** Validate input');
    expect(out).toContain('Automated review using ReviewAlly');
  });

  it('falls back to placeholder when background is empty', () => {
    const out = formatReview(doc({ background: '' }), [file()]);
    expect(out).toContain('_No background provided._');
  });

  it('falls back to placeholder when solution is empty', () => {
    const out = formatReview(doc({ solution: '' }), [file()]);
    expect(out).toContain('_No solution assessment provided._');
  });

  it('shows "looks solid" when there are no recommendations', () => {
    const out = formatReview(doc({ recommendations: [] }), [file()]);
    expect(out).toContain('_No high-level recommendations; the change looks solid._');
  });

  it('uses addition/deletion summary when no description for a file', () => {
    const out = formatReview(doc(), [file({ additions: 7, deletions: 3 })]);
    expect(out).toContain('7 addition(s), 3 deletion(s)');
  });

  it('maps all known change statuses', () => {
    const out = formatReview(doc({ files: [] }), [
      file({ filename: 'a.ts', status: 'added' }),
      file({ filename: 'b.ts', status: 'modified' }),
      file({ filename: 'c.ts', status: 'removed' }),
      file({ filename: 'd.ts', status: 'renamed' }),
      file({ filename: 'e.ts', status: 'copied' }),
      file({ filename: 'f.ts', status: 'changed' }),
      file({ filename: 'g.ts', status: 'weird-status' }),
    ]);
    expect(out).toContain('| Added |');
    expect(out).toContain('| Modified |');
    expect(out).toContain('| Removed |');
    expect(out).toContain('| Renamed |');
    expect(out).toContain('| Copied |');
    expect(out).toContain('| Changed |');
    expect(out).toContain('| Weird-status |');
  });

  it('escapes pipes in table cells', () => {
    const out = formatReview(doc({ files: [{ path: 'src/a.ts', description: 'a | b' }] }), [
      file(),
    ]);
    expect(out).toContain('a \\| b');
  });

  it('strips newlines from cell content', () => {
    const out = formatReview(doc({ files: [{ path: 'src/a.ts', description: 'line1\nline2' }] }), [
      file(),
    ]);
    expect(out).toContain('line1 line2');
    expect(out).not.toMatch(/line1\nline2/);
  });
});

describe('formatNoChanges', () => {
  it('returns the skip notice', () => {
    const out = formatNoChanges();
    expect(out).toContain('### Issue / Background');
    expect(out).toContain('No reviewable code changes');
    expect(out).toContain('Automated review using ReviewAlly');
  });
});

describe('formatRepairWarning', () => {
  it('states the response was repaired and embeds the raw preview', () => {
    const out = formatRepairWarning("{'background':'b'}");
    expect(out).toContain('not strict JSON');
    expect(out).toContain('automatically repaired');
    expect(out).toContain('may be incomplete');
    expect(out).toContain("{'background':'b'}");
  });
});
