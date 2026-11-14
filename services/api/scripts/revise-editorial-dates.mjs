/** Apply a reviewed date-only revision to the current editorial release. */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(resolve('services/api/package.json'));
const postgres = require('postgres');
const { canonicalAppContentJson } = require(resolve('packages/contracts/dist/app-content.js'));
const hash = value => createHash('sha256').update(canonicalAppContentJson(value)).digest('hex');
const [planPath, mode] = process.argv.slice(2);
if (!planPath || !['--preview', '--apply'].includes(mode)) {
  throw new Error('usage: node services/api/scripts/revise-editorial-dates.mjs PLAN --preview|--apply (run from repository root)');
}
if (!process.env.DATABASE_URL) throw new Error('missing_DATABASE_URL');

const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const validDate = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T12:00:00\+08:00$/.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 10) === value.slice(0, 10);
if (!Number.isSafeInteger(plan.baseVersion) || !/^[0-9a-f]{64}$/.test(plan.baseChecksum)
  || !plan.reason?.trim() || !Array.isArray(plan.edits) || !plan.edits.length
  || new Set(plan.edits.map(edit => edit.id)).size !== plan.edits.length
  || plan.edits.some(edit => !edit.id || !edit.slug || !validDate(edit.after) || edit.before === edit.after)) {
  throw new Error('invalid_editorial_date_plan');
}

const database = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  const report = await database.begin(async sql => {
    await sql`select pg_advisory_xact_lock(hashtext('app_content_publish'))`;
    const [active] = await sql`select version, checksum, payload from editorial_releases where active = true order by version desc limit 1 for update`;
    if (!active || active.version !== plan.baseVersion || active.checksum !== plan.baseChecksum
      || hash(active.payload) !== active.checksum || active.payload.schemaVersion !== 1
      || active.payload.version !== active.version || !Array.isArray(active.payload.articles)) {
      throw new Error('editorial_baseline_changed');
    }
    const next = structuredClone(active.payload);
    const articles = new Map(next.articles.map(article => [article.id, article]));
    if (articles.size !== next.articles.length) throw new Error('duplicate_article_id');
    for (const edit of plan.edits) {
      const article = articles.get(edit.id);
      if (!article || article.channel !== 'resource' || article.slug !== edit.slug
        || article.title !== edit.title || article.publishedAt !== edit.before) {
        throw new Error('editorial_article_changed:' + edit.id);
      }
      article.publishedAt = edit.after;
    }
    const resourceArticles = next.articles.filter(article => article.channel === 'resource');
    if (new Set(resourceArticles.map(article => article.publishedAt.slice(0, 10))).size !== resourceArticles.length) {
      throw new Error('resource_display_dates_overlap');
    }
    const ordered = [...resourceArticles].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    let index = 0;
    next.articles = next.articles.map(article => article.channel === 'resource' ? ordered[index++] : article);
    const [latest] = await sql`select max(version) as version from editorial_releases`;
    next.version = latest.version + 1;
    next.builtAt = new Date().toISOString();
    const checksum = hash(next);
    if (mode === '--apply') {
      await sql`update editorial_releases set active = false where active = true`;
      await sql`insert into editorial_releases (version, checksum, payload, active)
        values (${next.version}, ${checksum}, ${sql.json(next)}, true)`;
      await sql`insert into ops_audit_events
        (request_id, action, target_type, target_id, reason, before_state, after_state, metadata)
        values (${randomUUID()}, 'ops.editorial.revise-dates', 'editorial_release', ${String(next.version)},
        ${plan.reason}, ${sql.json({ version: active.version, checksum: active.checksum })},
        ${sql.json({ version: next.version, checksum })}, ${sql.json({ edits: plan.edits })})`;
    }
    return { mode, previousVersion: active.version, version: next.version, checksum,
      updated: plan.edits.length, resourceOrder: ordered.map(({ slug, publishedAt }) => ({ slug, publishedAt })) };
  });
  console.log(JSON.stringify(report));
} finally {
  await database.end({ timeout: 5 });
}
