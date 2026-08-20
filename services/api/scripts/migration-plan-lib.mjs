import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readMigrationFiles } from 'drizzle-orm/migrator';

const TARGETED_TAIL_MIGRATIONS = new Set([
  '0012_dry_sleeper',
  '0013_futuristic_wilson_fisk',
]);
const REQUIRED_PREDECESSORS = new Set([
  '0010_common_virginia_dare',
  '0011_easy_iron_fist',
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeDatabaseRow(row) {
  const createdAt = Number(row.created_at ?? row.createdAt);
  assert(Number.isSafeInteger(createdAt), `database_migration_invalid_created_at:${String(row.created_at)}`);
  assert(
    typeof row.hash === 'string' && /^[a-f0-9]{64}$/.test(row.hash),
    `database_migration_invalid_hash:${createdAt}`,
  );

  return {
    id: Number(row.id),
    hash: row.hash,
    createdAt,
  };
}

export async function loadLocalMigrations(migrationsFolder) {
  const journalPath = join(migrationsFolder, 'meta', '_journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8'));

  assert(journal?.dialect === 'postgresql', 'migration_journal_dialect_must_be_postgresql');
  assert(Array.isArray(journal.entries), 'migration_journal_entries_missing');

  const tags = new Set();
  let previousWhen = -1;
  for (const [position, entry] of journal.entries.entries()) {
    assert(entry.idx === position, `migration_journal_non_contiguous_idx:${entry.idx}:${position}`);
    assert(typeof entry.tag === 'string' && entry.tag.length > 0, `migration_journal_invalid_tag:${position}`);
    assert(!tags.has(entry.tag), `migration_journal_duplicate_tag:${entry.tag}`);
    assert(Number.isSafeInteger(entry.when), `migration_journal_invalid_when:${entry.tag}`);
    assert(entry.when > previousWhen, `migration_journal_non_increasing_when:${entry.tag}`);
    assert(typeof entry.breakpoints === 'boolean', `migration_journal_invalid_breakpoints:${entry.tag}`);
    tags.add(entry.tag);
    previousWhen = entry.when;
  }

  const sqlFiles = readdirSync(migrationsFolder)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const expectedSqlFiles = [...tags].map((tag) => `${tag}.sql`).sort();
  const unexpectedFiles = sqlFiles.filter((name) => !expectedSqlFiles.includes(name));
  const missingFiles = expectedSqlFiles.filter((name) => !sqlFiles.includes(name));
  assert(missingFiles.length === 0, `migration_sql_files_missing:${missingFiles.join(',')}`);
  assert(unexpectedFiles.length === 0, `migration_sql_files_not_in_journal:${unexpectedFiles.join(',')}`);

  // This is the same reader and SHA-256 implementation used by Drizzle's migrator.
  const drizzleMigrations = readMigrationFiles({ migrationsFolder });
  assert(
    drizzleMigrations.length === journal.entries.length,
    'migration_reader_and_journal_length_mismatch',
  );

  return journal.entries.map((entry, index) => {
    const migration = drizzleMigrations[index];
    assert(migration.folderMillis === entry.when, `migration_reader_timestamp_mismatch:${entry.tag}`);
    assert(/^[a-f0-9]{64}$/.test(migration.hash), `migration_reader_invalid_hash:${entry.tag}`);
    return {
      index: entry.idx,
      tag: entry.tag,
      createdAt: entry.when,
      hash: migration.hash,
      breakpoints: entry.breakpoints,
    };
  });
}

export function buildMigrationPlan(localMigrations, databaseRows, { tableExists = true } = {}) {
  const errors = [];
  const warnings = [];
  const normalizedRows = databaseRows.map(normalizeDatabaseRow);
  const localByCreatedAt = new Map(localMigrations.map((migration) => [migration.createdAt, migration]));
  const rowByCreatedAt = new Map();

  for (const row of normalizedRows) {
    if (rowByCreatedAt.has(row.createdAt)) {
      errors.push(`database_duplicate_migration_timestamp:${row.createdAt}`);
      continue;
    }
    rowByCreatedAt.set(row.createdAt, row);
    if (!localByCreatedAt.has(row.createdAt)) {
      errors.push(`database_migration_not_in_journal:${row.createdAt}:${row.hash}`);
    }
  }

  let sawPending = false;
  const migrations = localMigrations.map((migration) => {
    const databaseRow = rowByCreatedAt.get(migration.createdAt);
    let status;
    if (!databaseRow) {
      status = 'pending';
      sawPending = true;
    } else if (databaseRow.hash !== migration.hash) {
      status = 'hash_mismatch';
      errors.push(`migration_hash_mismatch:${migration.tag}:${databaseRow.hash}:${migration.hash}`);
    } else {
      status = 'applied';
      if (sawPending) errors.push(`database_migration_history_is_not_a_prefix:${migration.tag}`);
    }

    return {
      ...migration,
      status,
      databaseId: databaseRow?.id ?? null,
      databaseHash: databaseRow?.hash ?? null,
    };
  });

  const pendingTags = new Set(
    migrations.filter((migration) => migration.status === 'pending').map((migration) => migration.tag),
  );
  const targetedTailPending = [...TARGETED_TAIL_MIGRATIONS].some((tag) => pendingTags.has(tag));
  const predecessorPending = [...REQUIRED_PREDECESSORS].some((tag) => pendingTags.has(tag));

  if (!tableExists) {
    warnings.push('migration_table_missing_all_local_migrations_are_pending');
  }
  if (targetedTailPending) {
    warnings.push(
      '0012_0013_depend_on_0010_0011_verify_predecessors_and_never_cherry_pick',
    );
  }
  if (targetedTailPending && predecessorPending) {
    warnings.push(
      '0012_0013_require_0010_0011_review_and_ordered_application_no_cherry_pick',
    );
  }
  if (targetedTailPending) {
    warnings.push('drizzle_applies_the_complete_pending_suffix_in_journal_order');
  }

  return {
    tableExists,
    safe: errors.length === 0,
    appliedCount: migrations.filter((migration) => migration.status === 'applied').length,
    pendingCount: migrations.filter((migration) => migration.status === 'pending').length,
    driftCount: migrations.filter((migration) => migration.status === 'hash_mismatch').length,
    migrations,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}

export function isMigrationPlanCurrent(plan) {
  return plan.safe && plan.pendingCount === 0 && plan.driftCount === 0;
}

export function formatMigrationPlan(plan, targetLabel) {
  const lines = [
    'Drizzle migration plan (READ ONLY)',
    `Target: ${targetLabel}`,
    `Migration table: ${plan.tableExists ? 'present' : 'absent'}`,
    '',
  ];

  for (const migration of plan.migrations) {
    const marker = migration.status === 'applied'
      ? 'APPLIED'
      : migration.status === 'pending'
        ? 'PENDING'
        : 'DRIFT';
    lines.push(
      `${marker.padEnd(7)} ${migration.tag} when=${migration.createdAt} sha256=${migration.hash.slice(0, 12)}…`,
    );
  }

  lines.push(
    '',
    `Summary: applied=${plan.appliedCount} pending=${plan.pendingCount} drift=${plan.driftCount}`,
  );
  for (const warning of plan.warnings) lines.push(`WARNING: ${warning}`);
  for (const error of plan.errors) lines.push(`ERROR: ${error}`);
  lines.push(plan.safe ? 'Result: SAFE_TO_REVIEW (nothing was applied)' : 'Result: UNSAFE_MIGRATION_HISTORY');
  lines.push('No migration or database write was executed.');
  return lines.join('\n');
}
