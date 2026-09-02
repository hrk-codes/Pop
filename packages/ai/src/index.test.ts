import { describe, expect, it } from 'vitest';

import { aiRequestSchema } from './index';

describe('AI request', () => {
  it('bounds cloud payloads', () => {
    expect(() =>
      aiRequestSchema.parse({
        id: crypto.randomUUID(),
        task: 'IMPROVE_WRITING',
        text: 'x'.repeat(12_001),
      }),
    ).toThrow();
  });
});
