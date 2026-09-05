import { describe, it, expect } from 'vitest';
import { parseReview } from './parse';

describe('parseReview', () => {
  it('parses a clean JSON object', () => {
    const out = parseReview(
      JSON.stringify({
        background: 'b',
        solution: 's',
        files: [{ path: 'a.ts', description: 'd' }],
        recommendations: [{ category: 'Security', note: 'n' }],
      }),
    );
    expect(out).toEqual({
      background: 'b',
      solution: 's',
      files: [{ path: 'a.ts', description: 'd' }],
      recommendations: [{ category: 'Security', note: 'n' }],
    });
  });

  it('strips a markdown code fence', () => {
    const fenced =
      '```json\n{"background":"b","solution":"s","files":[],"recommendations":[]}\n```';
    expect(parseReview(fenced).background).toBe('b');
  });

  it('extracts JSON from surrounding prose', () => {
    const wrapped =
      'Here is the review:\n{"background":"b","solution":"s","files":[],"recommendations":[]}\nDone.';
    expect(parseReview(wrapped).background).toBe('b');
  });

  it('strips // and /* */ comments', () => {
    const commented = `{
      // background note
      "background": "b",
      /* inline */
      "solution": "s",
      "files": [],
      "recommendations": []
    }`;
    expect(parseReview(commented).background).toBe('b');
  });

  it('strips trailing commas inside arrays and objects', () => {
    const trailing =
      '{"background":"b","solution":"s","files":[{"path":"a",},{"path":"b",}],"recommendations":[]}';
    const trailingObj =
      '{"background":"b","solution":"s","files":[],"recommendations":[{"note":"n",},]}';
    expect(parseReview(trailing).files).toEqual([
      { path: 'a', description: '' },
      { path: 'b', description: '' },
    ]);
    expect(parseReview(trailingObj).recommendations[0]?.note).toBe('n');
  });

  it('defaults missing arrays to empty', () => {
    const out = parseReview('{"background":"b","solution":"s"}');
    expect(out.files).toEqual([]);
    expect(out.recommendations).toEqual([]);
  });

  it('skips files with empty path', () => {
    const out = parseReview(
      '{"background":"b","solution":"s","files":[{"path":"","description":"d"},{"path":"x","description":"y"}],"recommendations":[]}',
    );
    expect(out.files).toEqual([{ path: 'x', description: 'y' }]);
  });

  it('substitutes "Suggestion" for missing recommendation category', () => {
    const out = parseReview(
      '{"background":"b","solution":"s","files":[],"recommendations":[{"note":"n"}]}',
    );
    expect(out.recommendations[0]).toEqual({ category: 'Suggestion', note: 'n' });
  });

  it('throws on truly malformed JSON', () => {
    expect(() => parseReview('not json at all')).toThrow(
      /Could not parse model response|not a JSON object/,
    );
  });

  it('throws when the parsed result is an array, not an object', () => {
    expect(() => parseReview('[1,2,3]')).toThrow(/not a JSON object/);
  });

  it('throws when the parsed result is null', () => {
    expect(() => parseReview('null')).toThrow(/not a JSON object/);
  });

  it('throws when the parsed result is a primitive', () => {
    expect(() => parseReview('"just a string"')).toThrow(/not a JSON object/);
  });

  it('repairs single-quoted JSON via jsonrepair without mangling apostrophes', () => {
    const broken =
      "{'background':\"this isn't valid JSON\",'solution':'s','files':[],'recommendations':[]}";
    const out = parseReview(broken);
    expect(out.background).toBe("this isn't valid JSON");
    expect(out.solution).toBe('s');
  });

  it('repairs unquoted keys via jsonrepair', () => {
    const out = parseReview('{background:"b",solution:"s",files:[],recommendations:[]}');
    expect(out.background).toBe('b');
    expect(out.solution).toBe('s');
  });

  it('repairs truncated JSON via jsonrepair', () => {
    const out = parseReview(
      '{"background":"b","solution":"s","files":[],"recommendations":[{"category":"Security","note":"unterminat',
    );
    expect(out.background).toBe('b');
    expect(out.recommendations[0]?.category).toBe('Security');
  });

  it('repairs fenced and truncated JSON end to end', () => {
    const out = parseReview('```json\n{"background":"b","solution":"s"');
    expect(out.background).toBe('b');
    expect(out.solution).toBe('s');
  });

  it('throws when the response parses but carries no review content', () => {
    expect(() => parseReview('{}')).toThrow(/no review content/);
    expect(() =>
      parseReview('{"background":"","solution":"","files":[],"recommendations":[]}'),
    ).toThrow(/no review content/);
  });

  it('includes the model response preview when the result is not an object', () => {
    try {
      parseReview('This change looks good overall, nice work.');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as Error).message).toMatch(/not a JSON object: (string|array)/);
      expect((err as Error).message).toContain('This change looks good overall');
    }
  });
});
