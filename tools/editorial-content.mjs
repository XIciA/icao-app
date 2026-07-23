import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '..');
const sourceRoot = join(repoRoot, 'content/editorial');
const registryPath = join(sourceRoot, 'registry.json');
const buildRoot = join(repoRoot, 'dist/editorial-release');
const workflowStates = ['raw', 'extracted', 'editing', 'fact_checked', 'approved', 'built', 'preview_approved', 'published'];
const buildableStates = new Set(['approved', 'built', 'preview_approved', 'published']);
const forbiddenClaims = [
  /卡通过率/u,
  /战胜同批/u,
  /同批次.{0,8}(竞争|考生)/u,
  /宽松场次/u,
  /多考几次.{0,12}(总会|通过)/u,
  /保证.{0,8}(通过|拿下)/u,
  /稳过/u,
];
const placeholderPatterns = [/\bTODO\b/iu, /\bTBD\b/iu, /\bXXX\b/iu, /待补/u, /占位/u];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJson(value[key])]));
  }
  return value;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(stableJson(value), null, 2)}\n`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function parseFlags(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--') continue;
    if (token.startsWith('--')) {
      const [name, inlineValue] = token.slice(2).split('=', 2);
      if (inlineValue !== undefined) flags.set(name, inlineValue);
      else if (argv[index + 1] && !argv[index + 1].startsWith('--')) flags.set(name, argv[++index]);
      else flags.set(name, true);
    }
  }
  return flags;
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function imageDimensions(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      offset += 2 + bytes.readUInt16BE(offset + 2);
    }
  }
  fail('unsupported_cover_image');
}

function articleEntries() {
  const registry = readJson(registryPath);
  assert(registry.schemaVersion === 1, 'invalid_editorial_registry_schema');
  assert(Number.isInteger(registry.releaseVersion) && registry.releaseVersion > 0, 'invalid_editorial_release_version');
  assert(typeof registry.builtAt === 'string' && !Number.isNaN(Date.parse(registry.builtAt)), 'invalid_editorial_built_at');
  assert(Array.isArray(registry.articles) && registry.articles.length > 0, 'empty_editorial_registry');
  return {
    registry,
    entries: registry.articles.map((entry) => {
      const root = resolve(sourceRoot, entry);
      assert(root.startsWith(`${sourceRoot}/`), `invalid_editorial_path:${entry}`);
      return {
        root,
        metadata: readJson(join(root, 'metadata.json')),
        provenance: readJson(join(root, 'provenance.json')),
        review: readJson(join(root, 'review.json')),
        markdown: readFileSync(join(root, 'article.md'), 'utf8').replace(/\r\n/g, '\n'),
      };
    }),
  };
}

function validateEntry(entry, seenSlugs) {
  const { metadata, provenance, review, markdown, root } = entry;
  assert(metadata.schemaVersion === 1, `invalid_metadata_schema:${relative(sourceRoot, root)}`);
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.slug), `invalid_slug:${metadata.slug}`);
  assert(!seenSlugs.has(metadata.slug), `duplicate_slug:${metadata.slug}`);
  seenSlugs.add(metadata.slug);
  assert(['resource', 'opi_hotspot'].includes(metadata.channel), `invalid_channel:${metadata.slug}`);
  for (const field of ['id', 'title', 'summary', 'badge', 'category']) {
    assert(typeof metadata[field] === 'string' && metadata[field].trim(), `missing_metadata_${field}:${metadata.slug}`);
  }
  assert(Array.isArray(metadata.tags) && metadata.tags.length > 0, `missing_tags:${metadata.slug}`);
  assert(metadata.cover?.publicPath?.startsWith('/editorial-assets/'), `invalid_cover_path:${metadata.slug}`);
  assert(metadata.cover?.width === 800 && metadata.cover?.height === 500, `invalid_cover_dimensions_metadata:${metadata.slug}`);
  assert(['image/jpeg', 'image/png'].includes(metadata.cover?.mimeType), `invalid_cover_mime:${metadata.slug}`);

  const coverPath = resolve(root, metadata.cover.sourceFile);
  assert(coverPath.startsWith(`${sourceRoot}/`), `invalid_cover_source_path:${metadata.slug}`);
  assert(existsSync(coverPath), `missing_cover:${metadata.slug}`);
  const coverBytes = readFileSync(coverPath);
  const dimensions = imageDimensions(coverBytes);
  assert(dimensions.width === 800 && dimensions.height === 500, `invalid_cover_dimensions:${metadata.slug}:${dimensions.width}x${dimensions.height}`);

  const sourcePath = resolve(repoRoot, provenance.source?.path ?? '');
  assert(sourcePath.startsWith(`${repoRoot}/`), `invalid_source_path:${metadata.slug}`);
  assert(existsSync(sourcePath), `missing_original_source:${metadata.slug}`);
  assert(provenance.source.preserved === true, `original_not_marked_preserved:${metadata.slug}`);
  assert(sha256(readFileSync(sourcePath)) === provenance.source.sha256, `original_checksum_mismatch:${metadata.slug}`);
  assert(Array.isArray(provenance.factSources) && provenance.factSources.length > 0, `missing_fact_sources:${metadata.slug}`);
  for (const source of provenance.factSources) {
    assert(/^https:\/\//.test(source.url), `invalid_fact_source_url:${metadata.slug}:${source.id}`);
  }

  assert(workflowStates.includes(review.state), `invalid_review_state:${metadata.slug}:${review.state}`);
  assert(buildableStates.has(review.state), `article_not_approved:${metadata.slug}:${review.state}`);
  assert(review.languageReview?.approved === true, `language_review_missing:${metadata.slug}`);
  assert(review.factReview?.approved === true, `fact_review_missing:${metadata.slug}`);
  assert(review.rightsReview?.approved === true, `rights_review_missing:${metadata.slug}`);
  const sourceIds = new Set(provenance.factSources.map((source) => source.id));
  for (const sourceId of review.factReview.sourceIds ?? []) {
    assert(sourceIds.has(sourceId), `unknown_fact_source:${metadata.slug}:${sourceId}`);
  }

  assert(markdown.startsWith(`# ${metadata.title}\n`), `title_mismatch:${metadata.slug}`);
  assert(!/<[A-Za-z][^>]*>/u.test(markdown), `html_not_allowed:${metadata.slug}`);
  assert(!/!\[[^\n]*\]\(/u.test(markdown), `markdown_images_not_allowed:${metadata.slug}`);
  for (const pattern of forbiddenClaims) assert(!pattern.test(markdown), `unsupported_claim:${metadata.slug}:${pattern.source}`);
  for (const pattern of placeholderPatterns) assert(!pattern.test(markdown), `placeholder_found:${metadata.slug}:${pattern.source}`);

  const blocks = parseMarkdown(markdown, metadata.title);
  assert(blocks.length >= 8, `article_too_short:${metadata.slug}`);
  return {
    ...entry,
    cover: {
      ...metadata.cover,
      checksum: sha256(coverBytes),
      sizeBytes: coverBytes.byteLength,
      sourcePath: coverPath,
    },
    blocks,
  };
}

function parseMarkdown(markdown, title) {
  const lines = markdown.split('\n');
  assert(lines.shift() === `# ${title}`, 'invalid_markdown_title');
  const blocks = [];
  let index = 0;
  const skipBlank = () => {
    while (lines[index]?.trim() === '') index += 1;
  };
  skipBlank();
  while (index < lines.length) {
    const line = lines[index];
    if (line.startsWith('####') || line.startsWith('# ')) fail(`unsupported_heading:${line}`);
    const heading = /^(##|###) (.+)$/u.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      index += 1;
      skipBlank();
      continue;
    }
    const callout = /^> \[!(NOTE|WARNING)\](?: (.+))?$/u.exec(line);
    if (callout) {
      index += 1;
      const text = [];
      while (index < lines.length && lines[index].startsWith('> ')) {
        text.push(lines[index].slice(2).trim());
        index += 1;
      }
      assert(text.length > 0, `empty_callout:${callout[2] ?? ''}`);
      blocks.push({
        type: 'callout',
        tone: callout[1].toLowerCase(),
        ...(callout[2] ? { title: callout[2].trim() } : {}),
        text: text.join(' '),
      });
      skipBlank();
      continue;
    }
    if (/^- /u.test(line) || /^\d+\. /u.test(line)) {
      const ordered = /^\d+\. /u.test(line);
      const pattern = ordered ? /^\d+\. (.+)$/u : /^- (.+)$/u;
      const items = [];
      while (index < lines.length) {
        const match = pattern.exec(lines[index]);
        if (!match) break;
        items.push(match[1].trim());
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      skipBlank();
      continue;
    }
    assert(line.trim() && !line.startsWith('>'), `unsupported_markdown:${line}`);
    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !/^(##|###) /u.test(lines[index]) && !/^> \[!/u.test(lines[index]) && !/^- /u.test(lines[index]) && !/^\d+\. /u.test(lines[index])) {
      assert(!lines[index].startsWith('#'), `unsupported_heading:${lines[index]}`);
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    skipBlank();
  }
  return blocks;
}

function validateAll() {
  const { registry, entries } = articleEntries();
  const seenSlugs = new Set();
  const validated = entries.map((entry) => validateEntry(entry, seenSlugs));
  return { registry, entries: validated };
}

function build() {
  const { registry, entries } = validateAll();
  mkdirSync(join(buildRoot, 'assets'), { recursive: true });
  const articles = entries.map(({ metadata, provenance, review, blocks, cover }) => {
    const assetRelativePath = `${metadata.slug}/cover${extname(cover.sourcePath).toLowerCase()}`;
    const assetOutput = join(buildRoot, 'assets', assetRelativePath);
    mkdirSync(dirname(assetOutput), { recursive: true });
    copyFileSync(cover.sourcePath, assetOutput);
    return {
      id: metadata.id,
      slug: metadata.slug,
      version: metadata.version,
      channel: metadata.channel,
      category: metadata.category,
      badge: metadata.badge,
      title: metadata.title,
      summary: metadata.summary,
      tags: metadata.tags,
      publishedAt: metadata.publishedAt,
      cover: {
        publicPath: metadata.cover.publicPath,
        alt: metadata.cover.alt,
        width: metadata.cover.width,
        height: metadata.cover.height,
        mimeType: metadata.cover.mimeType,
        checksum: cover.checksum,
        sizeBytes: cover.sizeBytes,
      },
      blocks,
      sourceLinks: provenance.factSources.map(({ title, publisher, url }) => ({ title, publisher, url })),
      editorial: {
        sourceChecksum: provenance.source.sha256,
        factCheckedAt: review.factReview.reviewedAt,
      },
    };
  });
  const payload = {
    schemaVersion: 1,
    version: registry.releaseVersion,
    builtAt: registry.builtAt,
    articles,
  };
  const payloadBytes = Buffer.from(`${JSON.stringify(stableJson(payload), null, 2)}\n`);
  const checksum = sha256(payloadBytes);
  mkdirSync(buildRoot, { recursive: true });
  writeFileSync(join(buildRoot, 'release.json'), payloadBytes);
  writeJson(join(buildRoot, 'manifest.json'), {
    schemaVersion: 1,
    version: registry.releaseVersion,
    checksum,
    releaseFile: 'release.json',
    publicationGate: {
      approved: entries.every((entry) => ['preview_approved', 'published'].includes(entry.review.state) && entry.review.previewApproval?.approved === true),
      articles: entries.map((entry) => ({
        slug: entry.metadata.slug,
        state: entry.review.state,
        previewApprovedAt: entry.review.previewApproval?.approvedAt ?? null,
      })),
    },
    assets: articles.map((article) => ({
      articleSlug: article.slug,
      publicPath: article.cover.publicPath,
      objectKey: `${article.slug}/cover-${article.cover.checksum}${extname(entries.find((entry) => entry.metadata.slug === article.slug).cover.sourcePath).toLowerCase()}`,
      file: `assets/${article.slug}/cover${extname(entries.find((entry) => entry.metadata.slug === article.slug).cover.sourcePath).toLowerCase()}`,
      checksum: article.cover.checksum,
      sizeBytes: article.cover.sizeBytes,
      mimeType: article.cover.mimeType,
    })),
  });
  console.log(`editorial_build_ok version=${registry.releaseVersion} articles=${articles.length} checksum=${checksum}`);
  return { checksum, payload };
}

function extract(flags) {
  const input = flags.get('source');
  assert(typeof input === 'string', 'missing_--source');
  const sourcePath = resolve(repoRoot, input);
  assert(sourcePath.startsWith(`${repoRoot}/`), 'invalid_extract_source');
  assert(existsSync(sourcePath), `extract_source_not_found:${input}`);
  assert(extname(sourcePath).toLowerCase() === '.docx', 'extract_source_must_be_docx');
  const result = spawnSync('pandoc', ['-f', 'docx', '-t', 'gfm', sourcePath], { encoding: 'utf8' });
  assert(result.status === 0, `pandoc_extract_failed:${result.stderr.trim()}`);
  const output = flags.get('out')
    ? resolve(repoRoot, flags.get('out'))
    : join(repoRoot, '.generated/editorial/extracted', `${basename(sourcePath, '.docx')}.md`);
  assert(output.startsWith(`${repoRoot}/`), 'invalid_extract_output');
  mkdirSync(dirname(output), { recursive: true });
  const normalized = result.stdout.replace(/\r\n/g, '\n').trimEnd();
  writeFileSync(output, `<!-- source: ${relative(repoRoot, sourcePath)} -->\n<!-- sha256: ${sha256(readFileSync(sourcePath))} -->\n\n${normalized}\n`);
  console.log(`editorial_extract_ok source=${relative(repoRoot, sourcePath)} output=${relative(repoRoot, output)}`);
}

function preview(flags) {
  const { checksum, payload } = build();
  const port = Number(flags.get('port') ?? 4310);
  assert(Number.isInteger(port) && port > 0 && port < 65536, 'invalid_preview_port');
  const server = createServer((request, response) => {
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-headers', 'Authorization, Content-Type, If-None-Match');
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    const etag = `"${checksum}"`;
    if (request.headers['if-none-match'] === etag && url.pathname.startsWith('/v1/editorial')) {
      response.writeHead(304, { etag, 'cache-control': 'private, max-age=60' });
      response.end();
      return;
    }
    if (url.pathname === '/v1/editorial') {
      const channel = url.searchParams.get('channel');
      const items = payload.articles
        .filter((article) => !channel || article.channel === channel)
        .map(({ blocks: _blocks, sourceLinks: _sources, editorial: _editorial, ...summary }) => summary);
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', etag, 'cache-control': 'private, max-age=60' });
      response.end(JSON.stringify({ requestId: 'local-editorial-preview', data: { version: payload.version, checksum, items } }));
      return;
    }
    const detailMatch = /^\/v1\/editorial\/([^/]+)$/u.exec(url.pathname);
    if (detailMatch) {
      const article = payload.articles.find((candidate) => candidate.slug === decodeURIComponent(detailMatch[1]));
      if (!article) {
        response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ requestId: 'local-editorial-preview', error: { code: 'editorial_not_found', message: 'editorial_not_found', status: 404 } }));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', etag, 'cache-control': 'private, max-age=60' });
      response.end(JSON.stringify({ requestId: 'local-editorial-preview', data: { version: payload.version, checksum, article } }));
      return;
    }
    if (url.pathname.startsWith('/editorial-assets/')) {
      const asset = readJson(join(buildRoot, 'manifest.json')).assets.find((candidate) => candidate.publicPath === url.pathname);
      if (asset) {
        response.writeHead(200, { 'content-type': asset.mimeType, 'cache-control': 'private, max-age=300' });
        response.end(readFileSync(join(buildRoot, asset.file)));
        return;
      }
    }
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found');
  });
  server.listen(port, '127.0.0.1', () => console.log(`editorial_preview_ready http://127.0.0.1:${port}`));
}

function publish(flags) {
  const { entries } = validateAll();
  assert(flags.get('confirm-preview-approved') === true, 'publish_requires_--confirm-preview-approved');
  for (const entry of entries) {
    assert(['preview_approved', 'published'].includes(entry.review.state), `preview_not_approved:${entry.metadata.slug}`);
    assert(entry.review.previewApproval?.approved === true, `preview_approval_missing:${entry.metadata.slug}`);
  }
  build();
  const importer = join(repoRoot, 'services/api/scripts/import-editorial.mjs');
  const result = spawnSync(process.execPath, [importer], {
    cwd: repoRoot,
    env: { ...process.env, RELEASE_DIR: buildRoot },
    encoding: 'utf8',
    stdio: 'inherit',
  });
  assert(result.status === 0, `editorial_publish_failed:${result.status}`);
}

async function verifyLive(flags) {
  const baseUrl = String(flags.get('base-url') ?? process.env.EDITORIAL_API_BASE_URL ?? '').replace(/\/$/, '');
  const slug = String(flags.get('slug') ?? '');
  const token = process.env.EDITORIAL_VERIFY_TOKEN;
  assert(/^https?:\/\//.test(baseUrl), 'missing_or_invalid_--base-url');
  assert(slug, 'missing_--slug');
  assert(token, 'missing_EDITORIAL_VERIFY_TOKEN');
  const headers = { authorization: `Bearer ${token}` };
  const list = await fetch(`${baseUrl}/v1/editorial?channel=resource`, { headers });
  assert(list.ok, `editorial_live_list_failed:${list.status}`);
  const listBody = await list.json();
  assert(listBody.data.items.some((item) => item.slug === slug), `editorial_live_slug_missing:${slug}`);
  const detail = await fetch(`${baseUrl}/v1/editorial/${encodeURIComponent(slug)}`, { headers });
  assert(detail.ok, `editorial_live_detail_failed:${detail.status}`);
  const etag = detail.headers.get('etag');
  assert(etag, 'editorial_live_etag_missing');
  const cached = await fetch(`${baseUrl}/v1/editorial/${encodeURIComponent(slug)}`, { headers: { ...headers, 'if-none-match': etag } });
  assert(cached.status === 304, `editorial_live_304_failed:${cached.status}`);
  console.log(`editorial_live_verify_ok slug=${slug} etag=${etag}`);
}

const [command = 'check', ...argv] = process.argv.slice(2);
const flags = parseFlags(argv);

try {
  if (command === 'extract') extract(flags);
  else if (command === 'check') {
    const { entries } = validateAll();
    console.log(`editorial_check_ok articles=${entries.length}`);
  } else if (command === 'build') build();
  else if (command === 'preview') preview(flags);
  else if (command === 'publish') publish(flags);
  else if (command === 'verify-live') await verifyLive(flags);
  else fail(`unknown_editorial_command:${command}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
