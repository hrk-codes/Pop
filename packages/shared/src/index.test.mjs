import assert from 'node:assert/strict';
import test from 'node:test';

import { POP_NAME, POP_VERSION } from './index.ts';

test('shared package exposes the product identity', () => {
  assert.equal(POP_NAME, 'POP');
  assert.equal(POP_VERSION, '0.1.0');
});
