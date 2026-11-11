import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import postgres from 'postgres';
import { prepareAppContent } from './import-app-content.mjs';

// Explicit correction of one published feedback's display grouping. Original
// releases, work-order attribution, IDs, question links and text remain intact.
const [file, mode] = process.argv.slice(2);
if (!file || !['--preview', '--apply'].includes(mode)) throw new Error('usage: reassign-hotspot-center.mjs plan.json --preview|--apply');
const plan = JSON.parse(readFileSync(file, 'utf8'));
if (!plan.reason?.trim() || !plan.orderId || !plan.sourceId || !plan.expectedChecksum
  || !/^\d{4}-\d{2}-\d{2}$/.test(plan.date) || plan.date <= plan.freezeThrough
  || !plan.from || !plan.to || plan.from === plan.to) throw new Error('invalid_center_correction_plan');
const db = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
 const result = await db.begin(async sql => {
  await sql`select pg_advisory_xact_lock(hashtext('app_content_publish'))`;
  const [old] = await sql`select * from app_content_releases where active = true for update`;
  if (!old || old.checksum !== plan.expectedChecksum) throw new Error('content_changed_refresh_plan');
  const next = structuredClone(old.payload);
  const brief = next.hotspots.briefs.find(b => b.date === plan.date);
  const source = brief?.sources?.find(s => s.id === plan.sourceId && s.orderId === plan.orderId);
  if (!source || !isDeepStrictEqual(source.centers, [plan.from])) throw new Error('source_identity_changed');
  source.centers = [plan.to];
  brief.centers = [...new Set(brief.sources.filter(s => s.kind === 'feedback').flatMap(s => s.centers))];
  const restored = structuredClone(next);
  const restoredBrief = restored.hotspots.briefs.find(b => b.date === plan.date);
  restoredBrief.centers = old.payload.hotspots.briefs.find(b => b.date === plan.date).centers;
  restoredBrief.sources.find(s => s.id === plan.sourceId).centers = [plan.from];
  if (!isDeepStrictEqual(restored, old.payload)) throw new Error('unexpected_content_change');
  const [order] = await sql`select id, center from content_work_orders where id = ${plan.orderId}`;
  if (!order || order.center !== plan.from) throw new Error('original_attribution_missing');
  next.version = old.version + 1;
  next.publishedAt = new Date().toISOString();
  next.hotspots.generatedAt = next.publishedAt;
  const release = prepareAppContent(next);
  const report = { status: mode === '--apply' ? 'published' : 'preview', previousVersion: old.version,
   version: release.version, checksum: release.checksum, date: plan.date, from: plan.from, to: plan.to,
   sourceId: plan.sourceId, orderId: plan.orderId, reason: plan.reason,
   questionCount: new Set(source.topics.flatMap(t => t.cardIds)).size,
   frozenThrough: plan.freezeThrough, originalAttributionPreserved: true };
  if (mode === '--apply') {
   await sql`update app_content_releases set active = false where active = true`;
   await sql`insert into app_content_releases (version, checksum, payload, active) values (${release.version}, ${release.checksum}, ${sql.json(next)}, true)`;
   await sql`insert into ops_audit_events (request_id, action, target_type, target_id, reason, before_state, after_state, metadata)
    values (${randomUUID()}, 'ops.content.reassign-center', 'content_order', ${plan.orderId}, ${plan.reason}, ${sql.json({version:old.version,centers:[plan.from]})}, ${sql.json({version:release.version,centers:[plan.to]})}, ${sql.json(report)})`;
  }
  return report;
 });
 writeFileSync(file + (mode === '--apply' ? '.published.json' : '.preview.json'), JSON.stringify(result, null, 2)+'\n');
 console.log(JSON.stringify(result));
} finally { await db.end({ timeout: 5 }); }
