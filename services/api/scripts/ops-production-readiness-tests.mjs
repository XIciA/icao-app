import assert from 'node:assert/strict';
import test from 'node:test';

import { assertActiveOpsAdminCount } from './ops-production-readiness-lib.mjs';

test('accepts one or more active administrators', () => {
  assert.equal(assertActiveOpsAdminCount(1), 1);
  assert.equal(assertActiveOpsAdminCount('2'), 2);
});

test('rejects a production database with no active administrator', () => {
  assert.throws(() => assertActiveOpsAdminCount(0), /active_ops_admin_required/u);
});

test('rejects malformed query results', () => {
  for (const value of [undefined, null, -1, 1.5, 'unknown']) {
    assert.throws(() => assertActiveOpsAdminCount(value), /invalid_active_ops_admin_count/u);
  }
});
