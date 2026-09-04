import { readFile } from 'node:fs/promises';

import {
  assertProductionMigrationConfirmation,
  deriveJournalBoundPostPlan,
  parseRehearsalSuccess,
  productionMigrationConfirmation,
} from './production-migration-apply-lib.mjs';

const [command, ...args] = process.argv.slice(2);

if (command === 'derive-post') {
  const [prePlan, journalPath] = args;
  if (!journalPath) throw new Error('migration_journal_path_missing');
  const journal = JSON.parse(await readFile(journalPath, 'utf8'));
  console.log(deriveJournalBoundPostPlan(prePlan, journal));
} else {
  const [sourceSha, prePlan, postPlan, value] = args;
  if (command === 'print-confirmation') {
    console.log(productionMigrationConfirmation({ postPlan, prePlan, sourceSha }));
  } else if (command === 'confirm') {
    assertProductionMigrationConfirmation({ confirmation: value, postPlan, prePlan, sourceSha });
    console.log('production_migration_confirmation_verified');
  } else if (command === 'parse-rehearsal') {
    if (!value) throw new Error('rehearsal_log_path_missing');
    const parsed = parseRehearsalSuccess(await readFile(value, 'utf8'), {
      postPlan,
      prePlan,
      sourceSha,
    });
    console.log(`${parsed.backupName}|${parsed.evidencePath}`);
  } else {
    throw new Error('usage: production-migration-apply-contract.mjs <derive-post|print-confirmation|confirm|parse-rehearsal> <source-sha-or-pre-plan> <pre-plan-or-journal-path> <post-plan> [value]');
  }
}
