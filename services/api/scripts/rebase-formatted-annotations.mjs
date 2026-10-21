import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import postgres from 'postgres';

const require = createRequire(import.meta.url);
const { rebaseFormattedAnnotations } = require('../dist/src/sync/question-bank-format-compat.js');
const apply = process.argv.includes('--apply');
if (!process.env.DATABASE_URL) throw new Error('missing_DATABASE_URL');
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const counts = document => Object.values(document.entries ?? {}).reduce((result, entry) => ({ entries: result.entries + 1, highlights: result.highlights + (entry.highlights?.length ?? 0) }), { entries: 0, highlights: 0 });
const personal = document => JSON.stringify(document, (key, value) => ['wordIndex', 'contentFingerprint'].includes(key) ? undefined : value);
try {
  await sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext('app_content_publish'))`;
    const active = await tx`select bank_id, version from question_bank_releases where active`;
    assert.equal(active.length, 5);
    assert(active.every(bank => Number(bank.version) === 26), 'format_release_must_be_active_before_rebase');
    const rows = await tx`select user_id, payload, version from user_documents where document_key = 'annotations' for update`;
    let changedDocuments = 0, changedHighlights = 0, retainedHighlights = 0;
    for (const row of rows) {
      const after = rebaseFormattedAnnotations(row.payload);
      assert.deepEqual(counts(after), counts(row.payload), 'annotation_count_changed');
      assert.equal(personal(after), personal(row.payload), 'personal_content_changed');
      retainedHighlights += counts(row.payload).highlights;
      if (JSON.stringify(after) === JSON.stringify(row.payload)) continue;
      changedDocuments += 1;
      for (const [key, entry] of Object.entries(after.entries ?? {})) entry.highlights?.forEach((highlight, index) => {
        if (JSON.stringify(highlight) !== JSON.stringify(row.payload.entries[key].highlights[index])) changedHighlights += 1;
      });
      if (!apply) continue;
      const version = Number(row.version) + 1, updatedAt = new Date();
      await tx`update user_documents set payload = ${tx.json(after)}, version = ${version}, updated_at = ${updatedAt} where user_id = ${row.user_id} and document_key = 'annotations'`;
      const payload = { documentKey: 'annotations', document: after, version, updatedAt: updatedAt.toISOString() };
      await tx`insert into sync_changes (user_id, kind, entity_key, payload, version) values (${row.user_id}, 'document', 'annotations', ${tx.json(payload)}, ${version})`;
    }
    console.log(JSON.stringify({ status: apply ? 'annotations_rebased' : 'annotations_dry_run', documents: rows.length, changedDocuments, changedHighlights, retainedHighlights }));
  });
} finally { await sql.end({ timeout: 5 }); }
