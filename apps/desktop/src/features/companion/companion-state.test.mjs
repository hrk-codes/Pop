import assert from 'node:assert/strict';
import test from 'node:test';

import { COMPANION_DIMENSIONS, getMonitoringCopy, getNextExpandedMode } from './companion-state.ts';

test('companion modes have stable dimensions', () => {
  assert.deepEqual(COMPANION_DIMENSIONS.tiny, { width: 112, height: 112 });
  assert.deepEqual(COMPANION_DIMENSIONS.compact, { width: 324, height: 168 });
  assert.deepEqual(COMPANION_DIMENSIONS.expanded, { width: 368, height: 528 });
});

test('expanded toggle returns to compact mode', () => {
  assert.equal(getNextExpandedMode('compact'), 'expanded');
  assert.equal(getNextExpandedMode('expanded'), 'compact');
  assert.equal(getNextExpandedMode('tiny'), 'expanded');
});

test('monitoring copy never claims an integration is connected', () => {
  assert.equal(getMonitoringCopy(false).title, 'Private by default');
  assert.equal(getMonitoringCopy(true).detail, 'No integrations connected yet.');
});
