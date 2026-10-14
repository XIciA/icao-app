import postgres from 'postgres';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
const require = createRequire(import.meta.url);
const { isRetiredCard, emptyRetiredState, sanitizeRetiredAnnotations, sanitizeRetiredLearningRecord, sanitizeRetiredSyncPayload } = require('../dist/src/sync/retired-learning.js');
const apply = process.argv.includes('--apply');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_required');
if (apply && !process.env.RETIREMENT_BACKUP_DIR) throw new Error('protected_RETIREMENT_BACKUP_DIR_required');
const backupRoot = process.env.RETIREMENT_BACKUP_DIR && resolve(process.env.RETIREMENT_BACKUP_DIR);
if (backupRoot) mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const totals = { accounts: 0, cardStates: 0, annotationDocuments: 0, recordsUpdated: 0, recordsDeleted: 0, syncChanges: 0, receipts: 0, aiResults: 0 };
const cleanJson = value => JSON.parse(JSON.stringify(value));
try {
  const users = await sql`select id, ai_result_generation from accounts order by id`;
  for (const user of users) await sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${'learning:' + user.id}, 0))`;
    const cards = await tx`select * from user_card_states where user_id=${user.id} and bank_id='listening'`;
    const records = await tx`select * from learning_records where user_id=${user.id}`;
    const documents = await tx`select * from user_documents where user_id=${user.id} and document_key='annotations'`;
    const changes = await tx`select * from sync_changes where user_id=${user.id}`;
    const receipts = await tx`select * from sync_mutations where user_id=${user.id}`;
    const events = []; const changeWrites = []; const receiptWrites = []; const backup = { cards: [], records: [], documents: [], changes: [], receipts: [], aiResults: [] };
    const now = new Date().toISOString();
    for (const row of cards) {
      if (!isRetiredCard(row.bank_id, row.card_id)) continue;
      const empty = emptyRetiredState(row.state.updatedAt ?? now);
      if (isDeepStrictEqual(row.state, empty)) continue;
      backup.cards.push(row); totals.cardStates++;
      events.push({ kind: 'card_state', key: `${row.bank_id}:${row.topic_id}:${row.card_id}`, version: row.version + 1,
        payload: { bankId: row.bank_id, topicId: row.topic_id, cardId: row.card_id, state: emptyRetiredState(now), version: row.version + 1, updatedAt: now } });
    }
    for (const row of documents) {
      const clean = sanitizeRetiredAnnotations(row.payload);
      if (isDeepStrictEqual(row.payload, clean)) continue;
      backup.documents.push(row); totals.annotationDocuments++;
      events.push({ kind: 'document', key: 'annotations', version: row.version + 1,
        payload: { documentKey: 'annotations', document: clean, version: row.version + 1, updatedAt: now } });
    }
    const cleanRecords = new Map(records.map(row => [row.client_record_id, cleanJson(sanitizeRetiredLearningRecord(row.payload))]));
    const deletedSessions = new Set(records.filter(row => cleanRecords.get(row.client_record_id).deleted === true && row.payload.recordType !== 'ai_result').map(row => row.payload.sessionId).filter(Boolean));
    for (const row of records) {
      if (row.payload.recordType === 'ai_result' && deletedSessions.has(row.payload.sessionId)) cleanRecords.set(row.client_record_id, cleanJson({ deleted: true, recordType: 'ai_result', sessionId: row.payload.sessionId }));
      const clean = cleanRecords.get(row.client_record_id);
      if (isDeepStrictEqual(row.payload, clean)) continue;
      backup.records.push(row);
      if (clean.deleted) totals.recordsDeleted++; else totals.recordsUpdated++;
      events.push({ kind: 'learning_record', key: row.client_record_id, version: row.version + 1,
        payload: { recordId: row.client_record_id, record: clean, ...(clean.deleted ? { deleted: true } : {}),
          ...(clean.recordType === 'ai_result' ? { aiResultGeneration: user.ai_result_generation } : {}),
          occurredAt: row.occurred_at.toISOString(), version: row.version + 1, updatedAt: now } });
      if (clean.deleted && row.payload.recordType === 'ai_result') {
        const operation = row.payload.aiOperation?.operationId ?? row.payload.aiResult?.resumeOperationId;
        if (typeof operation === 'string') {
          const ai = await tx`select id,result_payload,result_deleted_at from ai_point_reservations where account_id=${user.id} and operation_id=${operation} and result_payload is not null`;
          backup.aiResults.push(...ai); totals.aiResults += ai.length;
        }
      }
    }
    // Replace private historical copies, retaining sequence/idempotency identities.
    const eventByKey = new Map(events.map(event => [`${event.kind}:${event.key}`, event]));
    for (const row of changes) {
      let clean = cleanJson(sanitizeRetiredSyncPayload(row.kind, row.payload));
      const event = eventByKey.get(`${row.kind}:${row.entity_key}`);
      if (event) clean = event.payload;
      const id = clean.recordId;
      if (row.kind === 'learning_record' && cleanRecords.get(id)?.deleted) clean = { ...clean, record: cleanRecords.get(id), deleted: true };
      if (isDeepStrictEqual(row.payload, clean)) continue;
      backup.changes.push(row); totals.syncChanges++;
      changeWrites.push({ row, clean });
    }
    for (const row of receipts) {
      if (!row.result?.authoritative) continue;
      let authoritative = cleanJson(sanitizeRetiredSyncPayload(row.kind, row.result.authoritative));
      const event = row.kind === 'card_state' ? eventByKey.get(`card_state:${authoritative.bankId}:${authoritative.topicId}:${authoritative.cardId}`)
        : row.kind === 'document' ? eventByKey.get(`document:${authoritative.documentKey}`) : eventByKey.get(`learning_record:${authoritative.recordId}`);
      if (event) authoritative = event.payload;
      if (row.kind === 'learning_record' && cleanRecords.get(authoritative.recordId)?.deleted) authoritative = { ...authoritative, record: cleanRecords.get(authoritative.recordId), deleted: true };
      const clean = { ...row.result, authoritative };
      if (isDeepStrictEqual(row.result, clean)) continue;
      backup.receipts.push(row); totals.receipts++;
      receiptWrites.push({ row, clean });
    }
    const affected = Object.values(backup).some(rows => rows.length);
    if (!affected) return;
    totals.accounts++;
    if (!apply) return;
    // Backup is written before destructive business-row writes; transaction failure rolls them back.
    writeFileSync(join(backupRoot, `${user.id}-${Date.now()}.json`), JSON.stringify(backup), { mode: 0o600 });
    for (const { row, clean } of changeWrites) await tx`update sync_changes set payload=${tx.json(clean)}, version=${clean.version ?? row.version} where sequence=${row.sequence}`;
    for (const { row, clean } of receiptWrites) await tx`update sync_mutations set result=${tx.json(clean)} where user_id=${user.id} and mutation_id=${row.mutation_id}`;
    for (const event of events) {
      if (event.kind === 'card_state') await tx`update user_card_states set state=${tx.json(event.payload.state)},version=${event.version},updated_at=${now} where user_id=${user.id} and bank_id=${event.payload.bankId} and topic_id=${event.payload.topicId} and card_id=${event.payload.cardId}`;
      if (event.kind === 'document') await tx`update user_documents set payload=${tx.json(event.payload.document)},version=${event.version},updated_at=${now} where user_id=${user.id} and document_key=${event.key}`;
      if (event.kind === 'learning_record') await tx`update learning_records set payload=${tx.json(event.payload.record)},version=${event.version},updated_at=${now} where user_id=${user.id} and client_record_id=${event.key}`;
      await tx`insert into sync_changes (user_id,kind,entity_key,payload,version) values (${user.id},${event.kind},${event.key},${tx.json(event.payload)},${event.version})`;
    }
    for (const ai of backup.aiResults) await tx`update ai_point_reservations set result_payload=null,result_deleted_at=${now} where id=${ai.id}`;
  });
  console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', ...totals }));
} finally { await sql.end({ timeout: 5 }); }
