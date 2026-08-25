import { readFile } from 'node:fs/promises';

import {
  assertProductionMigrationConfirmation,
  parseRehearsalSuccess,
  productionMigrationConfirmation,
} from './production-migration-apply-lib.mjs';

const [command, sourceSha, prePlan, postPlan, value] = process.argv.slice(2);

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
  throw new Error('usage: production-migration-apply-contract.mjs <print-confirmation|confirm|parse-rehearsal> <source-sha> <pre-plan> <post-plan> [value]');
}
