function normalizedTableSet(values, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || value.length === 0)) {
    throw new Error(`${label}_invalid`);
  }
  const sorted = [...values].sort();
  if (new Set(sorted).size !== sorted.length) throw new Error(`${label}_duplicate`);
  return sorted;
}

export function assessPublicTableClassification({ actualTables, expectedTables }) {
  const actual = normalizedTableSet(actualTables, 'actual_public_tables');
  const expected = normalizedTableSet(expectedTables, 'expected_public_tables');
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missingTables = expected.filter((table) => !actualSet.has(table));
  const unclassifiedTables = actual.filter((table) => !expectedSet.has(table));
  return {
    actualTables: actual,
    expectedTables: expected,
    missingTables,
    unclassifiedTables,
  };
}

export function assertPublicTableSecurityContract({
  assessment,
  clientDefaultGrantCount,
  clientGrantCount,
  disabledRlsCount,
}) {
  if (!assessment || !Array.isArray(assessment.actualTables)
    || !Array.isArray(assessment.expectedTables)
    || !Array.isArray(assessment.missingTables)
    || !Array.isArray(assessment.unclassifiedTables)) {
    throw new Error('production_schema_public_table_assessment_invalid');
  }
  if (assessment.unclassifiedTables.length !== 0) {
    throw new Error(`production_schema_unclassified_public_tables:${assessment.unclassifiedTables.length}`);
  }
  if (assessment.missingTables.length !== 0) {
    throw new Error(`production_schema_missing_public_tables:${assessment.missingTables.length}`);
  }
  if (!Number.isSafeInteger(disabledRlsCount) || disabledRlsCount !== 0) {
    throw new Error('production_schema_required_rls_disabled');
  }
  if (!Number.isSafeInteger(clientGrantCount) || clientGrantCount !== 0) {
    throw new Error('production_schema_server_only_table_grant_present');
  }
  if (!Number.isSafeInteger(clientDefaultGrantCount) || clientDefaultGrantCount !== 0) {
    throw new Error('production_schema_server_only_default_table_grant_present');
  }
  return {
    actualPublicTables: assessment.actualTables.length,
    expectedPublicTables: assessment.expectedTables.length,
    missingPublicTables: 0,
    serverOnlyClientGrants: 0,
    serverOnlyClientDefaultTableGrants: 0,
    unclassifiedPublicTables: 0,
  };
}
