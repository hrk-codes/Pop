import { describe, expect, it } from 'vitest';

import { speechDimensions } from './speech';

describe('speechDimensions', () => {
  it('keeps short thoughts compact', () => {
    expect(speechDimensions('A quick explanation.')).toEqual({ width: 286, height: 118 });
  });

  it('grows in both directions for a detailed explanation', () => {
    const short = speechDimensions('A quick explanation.');
    const detailed = speechDimensions('A useful, readable sentence. '.repeat(28));

    expect(detailed.width).toBeGreaterThan(short.width);
    expect(detailed.height).toBeGreaterThan(short.height);
    expect(detailed.height).toBeLessThanOrEqual(680);
  });

  it('counts explicit paragraphs as readable lines', () => {
    expect(speechDimensions('One\nTwo\nThree').height).toBeGreaterThan(118);
  });
});
