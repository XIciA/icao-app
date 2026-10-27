const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const PLAN_PATTERN = /^(0|[1-9][0-9]*):(0|[1-9][0-9]*):0$/u;
const BACKUP_PATTERN = /^icao-[0-9]{8}T[0-9]{6}Z-[0-9]+\.dump$/u;
const EVIDENCE_PATTERN = /^\/opt\/icao\/runtime\/migration-rehearsals\/evidence\/rehearsal-[a-f0-9]{12}-[0-9]{8}T[0-9]{6}Z\.txt$/u;

export const REUSABLE_REHEARSAL_SOURCE = '64678f357635f277090abe7c0f4e1c9adf8eb67f';
export const REUSABLE_REHEARSAL_EVIDENCE = '/opt/icao/runtime/migration-rehearsals/evidence/rehearsal-64678f357635-20261027T034722Z.txt';
export const WEB_PAY_REHEARSAL_SOURCE = 'f153b6579fd2990ae98626e54673158f0264ab73';
export const WEB_PAY_REHEARSAL_EVIDENCE = '/opt/icao/runtime/migration-rehearsals/evidence/rehearsal-f153b6579fd2-20261027T062958Z.txt';
export const WEB_PAY_REHEARSAL_ARCHIVE = 'cb3b17070cf583acd187da8539d0a7fa0a06a5b9ebe6d9ca7bb35dc7c202b8e4';
export const MIGRATION_PAYLOAD_PATHS = ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','patches',
  'modules/icao-distribution-environment','modules/icao-wechat-auth','packages/contracts','services/api',
  'content/vocabulary','content/app-content/text.json','content/question-banks/opi-hotspots.json','infra/api'];
const reviewedTestPath = 'services/api/scripts/vocabulary-storage-role-tests.mjs';
const reviewedTestBefore = 'd6fdc30447306c06046677c9d01d62f894460bc4';
const reviewedTestAfter = '3e674d452cdddc8f27b3d46234ba4aeb03b2c58f';

export function assertReviewedRehearsalDelta(changedPaths, beforeBlob, afterBlob) {
  if (changedPaths.length === 0) return;
  if (changedPaths.length !== 1 || changedPaths[0] !== reviewedTestPath
    || beforeBlob !== reviewedTestBefore || afterBlob !== reviewedTestAfter) {
    throw new Error('rehearsal_reuse_payload_difference_not_reviewed');
  }
}

/** Exact Oct27 receipts; web payment permits no payload differences at all. */
export function prepareRehearsalReuse(text, { root, runnerSha, prePlan, postPlan, evidencePath, gitRead }) {
  const webPayment = evidencePath === WEB_PAY_REHEARSAL_EVIDENCE;
  const payloadSource = webPayment ? WEB_PAY_REHEARSAL_SOURCE : REUSABLE_REHEARSAL_SOURCE;
  if (!SHA_PATTERN.test(runnerSha) || (!webPayment && evidencePath !== REUSABLE_REHEARSAL_EVIDENCE)) {
    throw new Error('rehearsal_reuse_identity_invalid');
  }
  validatePlanTransition(prePlan,postPlan);
  const fields = Object.create(null);
  for (const line of String(text).trim().split(/\r?\n/u)) {
    const index = line.indexOf('=');
    if (index < 1 || Object.hasOwn(fields,line.slice(0,index))) throw new Error('rehearsal_reuse_evidence_ambiguous');
    fields[line.slice(0,index)] = line.slice(index+1);
  }
  if (webPayment && (prePlan !== '57:1:0' || postPlan !== '58:0:0' || fields.archive_sha256 !== WEB_PAY_REHEARSAL_ARCHIVE)) throw new Error('web_payment_rehearsal_binding_mismatch');
  const required = { source_sha:payloadSource,pre_plan:prePlan,post_plan:postPlan,
    cleanup_verified:'1',isolated_database_removed:'1',missing_preexisting_tables:'0',
    preexisting_fingerprint_mismatches:'0',missing_contracts:'0',unvalidated_constraints:'0',
    device_digest_columns:'0',schema_contract_verified:'1' };
  for (const [key,value] of Object.entries(required)) {
    if (fields[key] !== value) throw new Error(`rehearsal_reuse_evidence_mismatch:${key}`);
  }
  for (const key of ['archive_sha256','backup_sha256','schema_contract_sha256']) {
    if (!/^[a-f0-9]{64}$/u.test(fields[key] ?? '')) throw new Error(`rehearsal_reuse_digest_invalid:${key}`);
  }
  if (!BACKUP_PATTERN.test(fields.backup_name ?? '')
    || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/u.test(fields.completed_at ?? '')
    || !Number.isFinite(Date.parse(fields.completed_at))) throw new Error('rehearsal_reuse_backup_or_time_invalid');
  const git = gitRead ?? (args => execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  git(['merge-base','--is-ancestor',payloadSource,runnerSha]);
  const changed = git(['diff','--name-only','-z',payloadSource,runnerSha,'--',...MIGRATION_PAYLOAD_PATHS]).split('\0').filter(Boolean);
  if (webPayment) {
    if (changed.length) throw new Error('web_payment_rehearsal_payload_changed');
    const originalTree = git(['ls-tree','-r','-z',payloadSource,'--',...MIGRATION_PAYLOAD_PATHS]);
    const runnerTree = git(['ls-tree','-r','-z',runnerSha,'--',...MIGRATION_PAYLOAD_PATHS]);
    if (originalTree !== runnerTree) throw new Error('web_payment_rehearsal_payload_tree_changed');
  } else {
  assertReviewedRehearsalDelta(changed,
    git(['rev-parse',`${payloadSource}:${reviewedTestPath}`]).trim(),
    git(['rev-parse',`${runnerSha}:${reviewedTestPath}`]).trim());
  for (const sha of [payloadSource,runnerSha]) {
    if (!git(['ls-tree',sha,'--',reviewedTestPath]).startsWith('100644 blob ')) {
      throw new Error('rehearsal_reuse_test_mode_not_reviewed');
    }
  }
  }
  const payloadTree = git(['ls-tree','-r','-z',payloadSource,'--',...MIGRATION_PAYLOAD_PATHS]);
  return { payloadSource:payloadSource,backupName:fields.backup_name,
    evidencePath,payloadTreeSha256:createHash('sha256').update(payloadTree).digest('hex'),
    evidenceSha256:createHash('sha256').update(text).digest('hex') };
}
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

export function deriveJournalBoundPostPlan(preValue, journal) {
  const pre = parsePlan(preValue, 'expected_pre_plan');
  if (pre.pending < 1) throw new Error('expected_pre_plan_requires_pending_migrations');
  if (journal?.dialect !== 'postgresql' || !Array.isArray(journal.entries)) {
    throw new Error('migration_journal_invalid');
  }
  journal.entries.forEach((entry, index) => {
    if (entry?.idx !== index
      || !Number.isSafeInteger(entry.when)
      || typeof entry.tag !== 'string'
      || entry.tag.length === 0) {
      throw new Error(`migration_journal_entry_invalid:${index}`);
    }
  });
  const migrationCount = journal.entries.length;
  if (pre.applied + pre.pending !== migrationCount) {
    throw new Error(
      `expected_pre_plan_not_bound_to_journal:${pre.applied}:${pre.pending}:${migrationCount}`,
    );
  }
  return `${migrationCount}:0:0`;
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

export function summarizeNonAuthoritativeRowCounts(before, after, label = 'row_count') {
  if (!Number.isSafeInteger(before) || before < 0 || !Number.isSafeInteger(after) || after < 0) {
    throw new Error(`${label}_invalid`);
  }
  return {
    after,
    before,
    delta: after - before,
    interpretation: 'non_authoritative_concurrent_activity_allowed',
  };
}
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
