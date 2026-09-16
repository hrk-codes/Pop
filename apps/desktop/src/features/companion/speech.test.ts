import { describe, expect, it } from 'vitest';

import { responseDragPreview, speechDimensions } from './speech';

describe('speechDimensions', () => {
  it('keeps short thoughts compact', () => {
    expect(speechDimensions('A quick explanation.')).toEqual({ width: 292, height: 128 });
  });

  it('grows in both directions for a detailed explanation', () => {
    const short = speechDimensions('A quick explanation.');
    const detailed = speechDimensions('A useful, readable sentence. '.repeat(28));

    expect(detailed.width).toBeGreaterThan(short.width);
    expect(detailed.height).toBeGreaterThan(short.height);
    expect(detailed.height).toBeLessThanOrEqual(680);
  });

  it('counts explicit paragraphs as readable lines', () => {
    expect(speechDimensions('One\nTwo\nThree').height).toBeGreaterThan(128);
  });

  it('uses the rendered text height instead of a character estimate', () => {
    expect(speechDimensions('A wrapping sentence.', 72).height).toBe(156);
  });
});

describe('responseDragPreview', () => {
  it('keeps a short response readable beside the pointer', () => {
    expect(responseDragPreview('  A useful reply.\nWith one more thought.  ')).toBe(
      'A useful reply. With one more thought.',
    );
  });

  it('bounds only the drag image while preserving the real response payload', () => {
    const response = 'meaningful reply '.repeat(20);
    const preview = responseDragPreview(response);

    expect(preview.length).toBeLessThanOrEqual(120);
    expect(preview.endsWith('...')).toBe(true);
  });
});
