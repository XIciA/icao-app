import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { cpus, totalmem, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { it, expect } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ContentAccessService } from '../src/content-access/content-access.service';
import { ResourceService } from '../src/resource/resource.service';
import { ResourceController } from '../src/resource/resource.controller';
import * as schema from '../src/database/schema';

// Opt-in; no DATABASE_URL/env file, no production auth or Storage traffic.
it.skipIf(process.env.ICAO_CAPACITY_TEST !== '1')('measures sustained logical users against real content services and disposable DB', async () => {
  const users = Number(process.env.CAPACITY_USERS ?? 2000), durationSeconds = Number(process.env.CAPACITY_SECONDS ?? 60);
  const rampSeconds = Number(process.env.CAPACITY_RAMP_SECONDS ?? 10), downloadRatio = Number(process.env.CAPACITY_DOWNLOAD_RATIO ?? 0.1);
  if (![users, durationSeconds, rampSeconds, downloadRatio].every(Number.isFinite) || !Number.isInteger(users) || users < 1 || users > 2000 || durationSeconds < 1 || durationSeconds > 300 || rampSeconds < 0 || rampSeconds > 60 || ![.05,.1,.2].includes(downloadRatio)) throw new Error('invalid_options');
  const root = mkdtempSync(join(tmpdir(), 'icao-capacity-')), data = join(root, 'data');
  let started = false, client: ReturnType<typeof postgres> | undefined;
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  try {
    const port = await new Promise<number>((accept, reject) => { const server = createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const a = server.address(); if (!a || typeof a === 'string') return reject(new Error('port')); server.close(error => error ? reject(error) : accept(a.port)); }); });
    execFileSync('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale'], { stdio: 'ignore' });
    // Durability stays on. Developer hardware is not an ECS capacity promise.
    execFileSync('pg_ctl', ['-D', data, '-o', `-h 127.0.0.1 -k ${root} -p ${port}`, '-w', 'start'], { stdio: 'ignore' }); started = true;
    client = postgres({ host: '127.0.0.1', port, username: 'postgres', database: 'postgres', max: 5, prepare: false, onnotice: () => undefined });
    await client.unsafe(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE supabase_admin; GRANT USAGE, CREATE ON SCHEMA public TO supabase_admin;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL);
      CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text NOT NULL,public boolean NOT NULL,file_size_limit bigint,allowed_mime_types text[]);`);
    for (const file of readdirSync('drizzle').filter(n => /^00\d\d_.*\.sql$/u.test(n)).sort()) await client.unsafe(readFileSync(join('drizzle', file), 'utf8').replaceAll('--> statement-breakpoint', ''));
    let sqlCount = 0;
    const db = drizzle(client, { schema, logger: { logQuery: () => { sqlCount++; } } });
    type Bank = { id: string; categories: { id: string; topics: { id: string; cards: { id: string; audio?: string; image?: string; retired?: boolean }[] }[] }[] };
    const banks = JSON.parse(readFileSync(resolve('../../src/features/question-bank/data/question-bank.json'), 'utf8')) as Bank[];
    const metadata = new Map<string, { publicPath: string; checksum: string; bankId: string }>();
    for (const bank of banks) {
      await db.insert(schema.questionBankReleases).values({ bankId: bank.id, version: 100, checksum: hash(JSON.stringify(bank)), payload: bank, active: true });
      for (const category of bank.categories) for (const topic of category.topics) for (const card of topic.cards) for (const path of [card.audio, card.image]) if (path?.startsWith('/question-bank-assets/')) metadata.set(path, { publicPath: path, checksum: hash(path), bankId: bank.id });
    }
    const paths = [...metadata.values()];
    for (let i = 0; i < paths.length; i += 500) await db.insert(schema.resourceObjects).values(paths.slice(i, i + 500).map(row => ({ objectKey: hash(row.publicPath), module: row.bankId, sourcePath: row.publicPath, checksum: row.checksum, sizeBytes: 100000, mimeType: row.publicPath.endsWith('.mp3') ? 'audio/mpeg' : 'image/png', status: 'ready' })));
    const accounts = Array.from({ length: users }, () => randomUUID());
    await db.insert(schema.accounts).values(accounts.map(id => ({ id })));
    await db.insert(schema.commerceProducts).values({ productKey: 'capacity-fixture', displayName: 'Synthetic capacity membership', durationDays: 365, basePriceCnyFen: 100, aiPointRuleVersion: 'fixture', aiPointBatchCount: 1, aiPointBatchIntervalDays: 1, aiPointsPerBatch: 1 });
    const orders = accounts.map(accountId => ({ id: randomUUID(), environment: 'production', channel: 'apple_app_store', externalOrderId: randomUUID(), accountId, originalAccountId: accountId, productKey: 'capacity-fixture', externalProductId: 'fixture', durationDays: 365, aiPointRuleVersion: 'fixture', membershipGrantSource: 'purchase_discovery', membershipEffectiveAt: new Date('2026-01-01'), membershipContributionMs: 86400000, purchasedAt: new Date('2026-01-01') }));
    for (let i = 0; i < users; i += 200) { await db.insert(schema.commerceOrders).values(orders.slice(i, i + 200)); await db.insert(schema.membershipEntitlementSegments).values(orders.slice(i, i + 200).map(order => ({ accountId: order.accountId, orderId: order.id, environment: 'production', revision: 1, startsAt: new Date('2026-01-01'), endsAt: new Date('2099-01-01') }))); }
    const content = new ContentAccessService({} as never, { db } as never);
    const resources = new ResourceService({ supabaseUrl: 'http://127.0.0.1:1', supabasePublicUrl: 'http://127.0.0.1:1', supabaseSecretKey: 'fixture-only' } as never, { db } as never, content);
    // Explicit upstream seam, not a real signing-capacity measurement. Never follows returned URLs.
    Object.assign(resources, { storage: { storage: { from: () => ({ createSignedUrl: async (key: string) => ({ data: { signedUrl: `http://127.0.0.1:1/${key}` }, error: null }) }) } } });
    const controller = new ResourceController(resources);
    const choices = banks.map(bank => { const category = bank.categories.find(c => c.topics.some(t => t.cards.some(card => !card.retired && card.audio)))!; const topic = category.topics.find(t => t.cards.some(card => !card.retired && card.audio))!; return { bank, category, topic, audio: topic.cards.find(card => !card.retired && card.audio)!.audio! }; });
    const prewarmed = process.env.CAPACITY_PREWARM === '1';
    // Optional separate payload survey; not used in timed baseline/candidate comparisons.
    const payloadSamples: { bankId: string; kind: string; jsonBytes: number; gzipBytes: number }[] = [];
    if (process.env.CAPACITY_SAMPLE_PAYLOADS === '1') for (const choice of choices) {
      const results = {
        topic: await content.getTopic(choice.bank.id, choice.category.id, choice.topic.id, accounts[0], 'fixture-session', 'production'),
        manifest: await content.offlineManifest(choice.bank.id, choice.bank.id === 'sentences900' ? 'icao5' : 'all', accounts[0], 'fixture-session', 'production'),
      };
      for (const [kind, value] of Object.entries(results)) {
        const json = Buffer.from(JSON.stringify(value));
        payloadSamples.push({ bankId: choice.bank.id, kind, jsonBytes: json.length, gzipBytes: gzipSync(json).length });
      }
    }
    if (prewarmed) for (const choice of choices) {
      await content.getCatalog(choice.bank.id, accounts[0], 'fixture-session', 'production');
      await content.offlineManifest(choice.bank.id, choice.bank.id === 'sentences900' ? 'icao5' : 'all', accounts[0], 'fixture-session', 'production');
    }
    const samples: Record<string, { service: number[]; scheduled: number[]; errors: Record<string, number>; bytes: number }> = {};
    let active = 0, peakActive = 0, dropped = 0, offered = 0, completed = 0, rssPeak = process.memoryUsage().rss;
    const maxActive = 256; // Visible harness shedding rather than unlimited allocation/OOM.
    const loop = monitorEventLoopDelay({ resolution: 10 }); loop.enable();
    const monitor = setInterval(() => { rssPeak = Math.max(rssPeak, process.memoryUsage().rss); }, 100);
    const cpuStart = process.cpuUsage(); sqlCount = 0; const start = performance.now(); const tasks: Promise<void>[] = [];
    function schedule(kind: string, offsetMs: number, action: () => Promise<unknown>) {
      offered++;
      tasks.push(new Promise<void>(done => setTimeout(() => {
        if (active >= maxActive) { dropped++; done(); return; }
        active++; peakActive = Math.max(active, peakActive); const entered = performance.now();
        const group = samples[kind] ??= { service: [], scheduled: [], errors: {}, bytes: 0 };
        void action().then(result => { group.bytes += Buffer.byteLength(JSON.stringify(result)); completed++; }, error => { const name = error instanceof Error ? error.message : 'unknown'; group.errors[name] = (group.errors[name] ?? 0) + 1; }).finally(() => { const now = performance.now(); group.service.push(now - entered); group.scheduled.push(now - start - offsetMs); active--; done(); });
      }, offsetMs)));
    }
    // Open-loop: slow responses cannot silently lower offered workload. Deterministic phase staggering.
    for (let user = 0; user < users; user++) {
      const account = accounts[user]!, choice = choices[(user + Math.floor(user / choices.length)) % choices.length]!, phase = user / users * rampSeconds * 1000;
      const downloader = Math.floor((user + 1) * downloadRatio) > Math.floor(user * downloadRatio), scope = choice.bank.id === 'sentences900' ? 'icao5' : 'all';
      if (downloader) schedule('download-manifest', phase, () => content.offlineManifest(choice.bank.id, scope, account, 'fixture-session', 'production'));
      for (let tick = 0; tick * 30 < durationSeconds; tick++) {
        const at = rampSeconds * 1000 + (user / users) * 30000 + tick * 30000;
        if (at >= (rampSeconds + durationSeconds) * 1000) continue;
        schedule('topic', at, () => content.getTopic(choice.bank.id, choice.category.id, choice.topic.id, account, 'fixture-session', 'production'));
        schedule('playback-resolve', at + 1000, () => resources.resolve(account, choice.audio, 'fixture-session', 'production'));
      }
      if (downloader) {
        const bankPaths = paths.filter(p => p.bankId === choice.bank.id);
        for (let tick = 0; tick * 10 < durationSeconds; tick++) {
          const at = rampSeconds * 1000 + (user / users) * 10000 + tick * 10000;
          if (at >= (rampSeconds + durationSeconds) * 1000) continue;
          const batch = Array.from({ length: 24 }, (_, i) => bankPaths[(tick * 24 + i) % bankPaths.length]!);
          schedule('download-resolve-24', at + 2000, () => controller.batch({ resources: batch }, undefined, { id: 'capacity', user: { id: account }, auth: { sessionId: 'fixture-session' } } as never));
        }
      }
    }
    await Promise.all([...tasks, new Promise(done => setTimeout(done, (durationSeconds + rampSeconds) * 1000))]);
    const elapsedMs = performance.now() - start; clearInterval(monitor); loop.disable(); const cpu = process.cpuUsage(cpuStart);
    const distribution = (v: number[]) => { v.sort((a,b) => a-b); return { count: v.length, p50Ms: v[Math.floor(v.length*.5)] ?? 0, p95Ms: v[Math.max(0,Math.ceil(v.length*.95)-1)] ?? 0, maxMs: v.at(-1) ?? 0 }; };
    const label = (process.env.CAPACITY_LABEL ?? 'candidate').replace(/[^a-zA-Z0-9_-]/g, '_');
    const report = { kind: 'isolated-service-database-load', label, commit: execFileSync('git', ['rev-parse','HEAD'], { encoding:'utf8' }).trim(), trackedDiffSha256: hash(execFileSync('git', ['diff', 'HEAD'], {encoding:'utf8', maxBuffer:32*1024*1024})), environment: { platform:process.platform, architecture:process.arch, cpus:cpus().length, cpuModel:cpus()[0]?.model, totalMemoryBytes:totalmem(), node:process.version, postgres:execFileSync('postgres',['--version'],{encoding:'utf8'}).trim(), dbPool:5 }, model:{prewarmed,users,durationSeconds,rampSeconds,downloadRatio,topicIntervalSeconds:30,playbackResolveIntervalSeconds:30,downloadBatchIntervalSeconds:10,batchSize:24,maxActive}, fixture:{banks:banks.map(b=>b.id),resourceRows:paths.length,membershipAccounts:accounts.length,content:'repository question-bank JSON',mediaMetadata:'synthetic path hashes and 100000-byte sizes; no audio bytes transferred'}, exclusions:['HTTP/TLS and Nest guards','Supabase JWT refresh and identity transactions','real Storage signing','internet bandwidth/CDN','phone decoding/encryption/storage','sync writes','real AI/payment/SMS'], elapsedMs, offered, completed, dropped, peakActive,sqlCount,rssPeak,cpuMilliseconds:(cpu.user+cpu.system)/1000,eventLoopP95Ms:loop.percentile(95)/1e6,measurements:Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,{service:distribution(v.service),scheduledToCompletion:distribution(v.scheduled),errors:v.errors,serializedBytes:v.bytes}])) };
    mkdirSync('.generated',{recursive:true}); const output=resolve(`.generated/capacity-${label}-${users}-${downloadRatio}.json`); writeFileSync(output,JSON.stringify({ ...report, payloadSamples },null,2));
    console.log('Capacity evidence:',output,JSON.stringify({offered,completed,dropped,peakActive,elapsedMs}));
    expect(completed+dropped+Object.values(samples).reduce((sum,g)=>sum+Object.values(g.errors).reduce((a,b)=>a+b,0),0)).toBe(offered);
  } finally { if(client) await client.end(); if(started) execFileSync('pg_ctl',['-D',data,'-m','immediate','-w','stop'],{stdio:'ignore'}); rmSync(root,{recursive:true,force:true}); }
}, 420000);
