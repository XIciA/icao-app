import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertReviewedRehearsalDelta, MIGRATION_PAYLOAD_PATHS, prepareRehearsalReuse,
  REUSABLE_REHEARSAL_EVIDENCE, REUSABLE_REHEARSAL_SOURCE } from './production-migration-apply-lib.mjs';

const source = await readFile(new URL('../scripts/apply-production-migrations.sh',import.meta.url),'utf8');
function block(name) {
  const begin = `# BEGIN production-migration-${name}`;
  const end = `# END production-migration-${name}`;
  assert.ok(source.includes(begin) && source.includes(end),name);
  return source.slice(source.indexOf(begin)+begin.length,source.indexOf(end));
}
const fixturePath = 'services/api/scripts/vocabulary-storage-role-tests.mjs';
const beforeBlob = 'd6fdc30447306c06046677c9d01d62f894460bc4';
const afterBlob = '3e674d452cdddc8f27b3d46234ba4aeb03b2c58f';
const evidence = `source_sha=${REUSABLE_REHEARSAL_SOURCE}
archive_sha256=${'a'.repeat(64)}
backup_sha256=${'b'.repeat(64)}
schema_contract_sha256=${'c'.repeat(64)}
backup_name=icao-20261027T031435Z-42.dump
pre_plan=55:2:0
post_plan=57:0:0
cleanup_verified=1
isolated_database_removed=1
missing_preexisting_tables=0
preexisting_fingerprint_mismatches=0
missing_contracts=0
unvalidated_constraints=0
device_digest_columns=0
schema_contract_verified=1
completed_at=2026-10-27T03:47:22Z
`;
const gitRead = args => {
  if (args[0]==='merge-base') return '';
  if (args[0]==='diff') { assert.deepEqual(args.slice(6),MIGRATION_PAYLOAD_PATHS); return `${fixturePath}\0`; }
  if (args[0]==='rev-parse') return args[1].startsWith(REUSABLE_REHEARSAL_SOURCE) ? beforeBlob : afterBlob;
  return `100644 blob ${beforeBlob}\t${fixturePath}\0`;
};
const options = {root:'/fixture',runnerSha:'d'.repeat(40),prePlan:'55:2:0',postPlan:'57:0:0',
  evidencePath:REUSABLE_REHEARSAL_EVIDENCE,gitRead};

test('only the approved test blob transition may differ from the original immutable payload',()=>{
  assert.doesNotThrow(()=>assertReviewedRehearsalDelta([fixturePath],beforeBlob,afterBlob));
  for (const changed of [['services/api/src/main.ts'],['services/api/drizzle/0056_vocabulary_live_releases.sql'],
    [fixturePath,'package.json'],['services/api/scripts/another-test.mjs']]) {
    assert.throws(()=>assertReviewedRehearsalDelta(changed,beforeBlob,afterBlob),/not_reviewed/);
  }
  assert.throws(()=>assertReviewedRehearsalDelta([fixturePath],beforeBlob,'e'.repeat(40)),/not_reviewed/);
  const result = prepareRehearsalReuse(evidence,options);
  assert.equal(result.payloadSource,REUSABLE_REHEARSAL_SOURCE);
  assert.match(result.payloadTreeSha256,/^[a-f0-9]{64}$/);
  assert.match(result.evidenceSha256,/^[a-f0-9]{64}$/);
  assert.throws(()=>prepareRehearsalReuse(evidence,{...options,gitRead:args=>args[0]==='merge-base'
    ? (()=>{throw new Error('not_ancestor');})() : gitRead(args)}),/not_ancestor/);
  assert.throws(()=>prepareRehearsalReuse(evidence,{...options,gitRead:args=>args[0]==='ls-tree'
    ? '120000 blob mode-changed' : gitRead(args)}),/mode_not_reviewed/);
});
test('reuse rejects another source/path, duplicate fields, corrupt digests, dirty preservation and plan mismatch',()=>{
  for (const [from,to] of [
    [REUSABLE_REHEARSAL_SOURCE,'e'.repeat(40)],['55:2:0','54:3:0'],['cleanup_verified=1','cleanup_verified=0'],
    ['preexisting_fingerprint_mismatches=0','preexisting_fingerprint_mismatches=1'],
    ['schema_contract_verified=1','schema_contract_verified=0'],['a'.repeat(64),'not-a-checksum'],
  ]) assert.throws(()=>prepareRehearsalReuse(evidence.replace(from,to),options));
  assert.throws(()=>prepareRehearsalReuse(`${evidence}source_sha=${REUSABLE_REHEARSAL_SOURCE}\n`,options),/ambiguous/);
  assert.throws(()=>prepareRehearsalReuse(evidence,{...options,evidencePath:'/tmp/copied-evidence'}),/identity_invalid/);
});
test('both archives and the reuse equivalence proof bind the same complete payload roots',async()=>{
  for (const file of ['apply-production-migrations.sh','rehearse-production-migrations.sh']) {
    const text = await readFile(new URL(`../scripts/${file}`,import.meta.url),'utf8');
    const match = /git archive --format=tar "\$(?:PAYLOAD_SOURCE|SOURCE)_SHA"([\s\S]*?)\| gzip -n/u.exec(text);
    assert.ok(match,file);
    assert.deepEqual(match[1].replaceAll('\\','').trim().split(/\s+/),MIGRATION_PAYLOAD_PATHS);
  }
});
test('long rehearsals pass while future, stale completion and unbounded backup times fail',()=>{
  const run = ({age=300,duration=1980,reused=0}={}) => spawnSync('/bin/sh',['-c',`set -eu
now_epoch=1800000000
rehearsal_completed_epoch=$((now_epoch - ${age}))
backup_mtime=$((rehearsal_completed_epoch - ${duration}))
rehearsal_reused=${reused}
${block('rehearsal-completion-window')}
${block('rehearsal-backup-window')}
`],{encoding:'utf8'});
  for (const fixture of [{},{age:1800,duration:21600},{age:1900,duration:1980,reused:1}]) {
    const result=run(fixture);assert.equal(result.status,0,result.stderr);
  }
  for (const fixture of [{age:-1},{age:1801},{duration:-1},{duration:21601},
    {age:23401,duration:0,reused:1}]) assert.notEqual(run(fixture).status,0,JSON.stringify(fixture));
});
test('fresh reuse proof binds exact locked pre-plan and original timestamps, without a new rehearsal claim',async()=>{
  const root=await mkdtemp(join(tmpdir(),'icao-reuse-proof-'));
  try {
    const run=pre=>spawnSync('/bin/sh',['-c',`set -eu
rehearsal_reused=1
pre_summary="$TEST_PRE"
expected_pre_plan=55:2:0
backup_mtime=$(( $(date +%s) - 3600 ))
evidence_dir="$TEST_ROOT"
source_id=dddddddddddd
source_sha=${'d'.repeat(40)}
upload_token=${'1'.repeat(32)}
payload_source_sha=${REUSABLE_REHEARSAL_SOURCE}
archive_sha=${'a'.repeat(64)}
payload_tree_sha=${'b'.repeat(64)}
reused_evidence_sha=${'c'.repeat(64)}
rehearsal_schema_contract_sha=${'d'.repeat(64)}
backup_sha=${'e'.repeat(64)}
rehearsal_evidence=${REUSABLE_REHEARSAL_EVIDENCE}
rehearsal_completed_at=2026-10-27T03:47:22Z
require_root_owned_path() { test -f "$2"; }
${block('reuse-state-proof')}
`],{encoding:'utf8',env:{...process.env,TEST_PRE:pre,TEST_ROOT:root}});
    assert.notEqual(run('54:3:0').status,0);
    const result=run('55:2:0');assert.equal(result.status,0,result.stderr);
    const proof=join(root,`reuse-dddddddddddd-${'1'.repeat(32)}.txt`);
    const body=await readFile(proof,'utf8');
    assert.match(body,/authority=locked_readonly_ledger_reconfirmation/);
    assert.match(body,/original_rehearsal_completed_at=2026-10-27T03:47:22Z/);
    assert.match(body,new RegExp(`payload_source_sha=${REUSABLE_REHEARSAL_SOURCE}`));
    assert.equal((await stat(proof)).mode&0o777,0o600);
    assert.notEqual(run('55:2:0').status,0,'never overwrite an existing proof');
  } finally {await rm(root,{recursive:true,force:true});}
});
test('reuse still requires a nonfuture readonly reconfirmation within 30 minutes at drain',()=>{
  for(const age of [-1,0,1800,1801]) {
    const result=spawnSync('/bin/sh',['-c',`set -eu
date() { echo 1800000000; }
rehearsal_reused=1
reuse_pre_plan_epoch=$(( $(date +%s) - ${age} ))
${block('reuse-freshness')}
`],{encoding:'utf8'});
    assert.equal(result.status===0,age>=0&&age<=1800,String(age));
  }
});
test('every SSH/SCP call carries bounded connection/keepalive options including cleanup and reuse',async()=>{
  const root=await mkdtemp(join(tmpdir(),'icao-migration-ssh-'));
  try {
    for(const name of ['ssh','scp']) {
      const path=join(root,name);await writeFile(path,'#!/bin/sh\nprintf "%s\\n" "$@"\n');await chmod(path,0o700);
    }
    for(const file of ['apply-production-migrations.sh','rehearse-production-migrations.sh']) {
      const text=await readFile(new URL(`../scripts/${file}`,import.meta.url),'utf8');
      const lines=text.split('\n').filter(line=>/^\s*(ssh|scp) -/u.test(line));
      assert.ok(lines.length>=5,file);
      for(const line of lines) {
        const result=spawnSync('/bin/sh',['-c',line.trim().replace(/\s*\\$/u,'')],
          {encoding:'utf8',env:{...process.env,PATH:`${root}:${process.env.PATH}`,
            SSH_KEY:'fixture key',ECS_USER:'fixture',ECS_HOST:'fixture.invalid',ARCHIVE:'/fixture archive'}});
        assert.equal(result.status,0,result.stderr);
        const argv=result.stdout.trim().split('\n');
        for(const option of ['BatchMode=yes','ConnectTimeout=10','ServerAliveInterval=15','ServerAliveCountMax=3'])
          assert.ok(argv.includes(option),`${file}: ${option}`);
      }
    }
    const actual=spawnSync('ssh',['-G','-F','/dev/null','-o','ConnectTimeout=10','-o','ServerAliveInterval=15',
      '-o','ServerAliveCountMax=3','fixture.invalid'],{encoding:'utf8'});
    assert.equal(actual.status,0,actual.stderr);
    assert.match(actual.stdout,/^connecttimeout 10$/mu);
    assert.match(actual.stdout,/^serveraliveinterval 15$/mu);
    assert.match(actual.stdout,/^serveralivecountmax 3$/mu);
  } finally {await rm(root,{recursive:true,force:true});}
});
