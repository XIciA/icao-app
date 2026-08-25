const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const PLAN_PATTERN = /^(0|[1-9][0-9]*):(0|[1-9][0-9]*):0$/u;
const BACKUP_PATTERN = /^icao-[0-9]{8}T[0-9]{6}Z-[0-9]+\.dump$/u;
const EVIDENCE_PATTERN = /^\/opt\/icao\/runtime\/migration-rehearsals\/evidence\/rehearsal-[a-f0-9]{12}-[0-9]{8}T[0-9]{6}Z\.txt$/u;

export function parsePlan(value, label = 'plan') {
  const match = typeof value === 'string' ? PLAN_PATTERN.exec(value) : null;
  if (!match) throw new Error(`${label}_invalid`);
  const applied = Number(match[1]);
  const pending = Number(match[2]);
  if (!Number.isSafeInteger(applied) || !Number.isSafeInteger(pending)) {
    throw new Error(`${label}_unsafe_integer`);
  }
  return { applied, drift: 0, pending, summary: value };
}

export function validatePlanTransition(preValue, postValue) {
  const pre = parsePlan(preValue, 'expected_pre_plan');
  const post = parsePlan(postValue, 'expected_post_plan');
  if (pre.pending < 1) throw new Error('expected_pre_plan_requires_pending_migrations');
  if (post.pending !== 0 || post.applied !== pre.applied + pre.pending) {
    throw new Error('expected_plan_transition_invalid');
  }
  return { post, pre };
}

export function productionMigrationConfirmation({ postPlan, prePlan, sourceSha }) {
  if (!SHA_PATTERN.test(sourceSha)) throw new Error('source_sha_invalid');
  validatePlanTransition(prePlan, postPlan);
  return `APPLY_PRODUCTION_MIGRATIONS:${sourceSha}:${prePlan}:${postPlan}`;
}

export function assertProductionMigrationConfirmation({ confirmation, postPlan, prePlan, sourceSha }) {
  const expected = productionMigrationConfirmation({ postPlan, prePlan, sourceSha });
  if (confirmation !== expected) throw new Error(`production_confirmation_mismatch:${expected}`);
  return expected;
}

export function parseRehearsalSuccess(output, { postPlan, prePlan, sourceSha }) {
  if (!SHA_PATTERN.test(sourceSha)) throw new Error('source_sha_invalid');
  validatePlanTransition(prePlan, postPlan);
  const matches = String(output).split(/\r?\n/u).filter((line) => (
    line.startsWith('production_migration_rehearsal_ok ')
  ));
  if (matches.length !== 1) throw new Error('rehearsal_success_line_count_invalid');
  const match = /^production_migration_rehearsal_ok source=([a-f0-9]{40}) backup=([^ ]+) pre=([^ ]+) post=([^ ]+) evidence=(\/[^ ]+)$/u.exec(matches[0]);
  if (!match) throw new Error('rehearsal_success_line_invalid');
  const [, actualSource, backupName, actualPre, actualPost, evidencePath] = match;
  if (actualSource !== sourceSha) throw new Error('rehearsal_source_mismatch');
  if (actualPre !== prePlan) throw new Error('rehearsal_pre_plan_mismatch');
  if (actualPost !== postPlan) throw new Error('rehearsal_post_plan_mismatch');
  if (!BACKUP_PATTERN.test(backupName)) throw new Error('rehearsal_backup_name_invalid');
  if (!EVIDENCE_PATTERN.test(evidencePath)) throw new Error('rehearsal_evidence_path_invalid');
  return { backupName, evidencePath };
}

export function assertMonotonicRowCounts(before, after, label = 'row_count') {
  if (!Number.isSafeInteger(before) || before < 0 || !Number.isSafeInteger(after) || after < 0) {
    throw new Error(`${label}_invalid`);
  }
  if (after < before) throw new Error(`${label}_decreased`);
  return { additions: after - before, after, before };
}
