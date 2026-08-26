import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assessPublicTableClassification,
  assertPublicTableSecurityContract,
} from './production-schema-contract-lib.mjs';

const expectedTables = ['accounts', 'profiles'];

function verify(actualTables, overrides = {}) {
  return assertPublicTableSecurityContract({
    assessment: assessPublicTableClassification({ actualTables, expectedTables }),
    clientDefaultGrantCount: 0,
    clientGrantCount: 0,
    disabledRlsCount: 0,
    ...overrides,
  });
}

test('live verifier accepts only an exact classified public-table set', () => {
  assert.deepEqual(verify(['profiles', 'accounts']), {
    actualPublicTables: 2,
    expectedPublicTables: 2,
    missingPublicTables: 0,
    serverOnlyClientGrants: 0,
    serverOnlyClientDefaultTableGrants: 0,
    unclassifiedPublicTables: 0,
  });
  assert.throws(
    () => verify(['accounts', 'profiles', 'unexpected_public_table']),
    /production_schema_unclassified_public_tables:1/u,
  );
  assert.throws(
    () => verify(['accounts']),
    /production_schema_missing_public_tables:1/u,
  );
});

test('live verifier rejects any RLS gap or anon/authenticated table grant', () => {
  assert.throws(
    () => verify(expectedTables, { disabledRlsCount: 1 }),
    /production_schema_required_rls_disabled/u,
  );
  assert.throws(
    () => verify(expectedTables, { clientGrantCount: 1 }),
    /production_schema_server_only_table_grant_present/u,
  );
  assert.throws(
    () => verify(expectedTables, { clientDefaultGrantCount: 1 }),
    /production_schema_server_only_default_table_grant_present/u,
  );
});
