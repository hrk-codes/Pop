import assert from 'node:assert/strict';
import test from 'node:test';

import { COMPANION_DIMENSIONS, getNextExpandedMode } from './companion-state.ts';

test('companion modes have stable dimensions', () => {
  assert.deepEqual(COMPANION_DIMENSIONS.tiny, { width: 112, height: 112 });
  assert.deepEqual(COMPANION_DIMENSIONS.compact, { width: 324, height: 168 });
  assert.deepEqual(COMPANION_DIMENSIONS.expanded, { width: 388, height: 560 });
});

test('expanded toggle returns to compact mode', () => {
  assert.equal(getNextExpandedMode('compact'), 'expanded');
  assert.equal(getNextExpandedMode('expanded'), 'compact');
  assert.equal(getNextExpandedMode('tiny'), 'expanded');
});

test('all companion dimensions are positive integers', () => {
  for (const dimensions of Object.values(COMPANION_DIMENSIONS)) {
    assert.equal(Number.isInteger(dimensions.width), true);
    assert.equal(Number.isInteger(dimensions.height), true);
    assert.equal(dimensions.width > 0, true);
    assert.equal(dimensions.height > 0, true);
  }
});
