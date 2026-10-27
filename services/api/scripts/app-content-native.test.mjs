import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { assertImmutableRelease, prepareNativeContentRelease, selectNativeContentBanks } from './native-content-release.mjs';
import { assertHotspotSourcesPreserved, assertLegalDocumentVersions, prepareAppContent } from './import-app-content.mjs';
const root = new URL('../../../', import.meta.url);
const json = (name) => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
function evaluate(path, modules, extras = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(path, root), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(source, { exports, require: (name) => { if (!(name in modules)) throw new Error(`unexpected_import:${name}`); return modules[name]; }, Map, Set, Date, ...extras });
  return exports;
}
function fixture() {
  const storage = new Map();
  const getBase = vi.fn(() => 'https://api.example.test');
  const fetch = vi.fn().mockRejectedValue(new Error('offline'));
  const repository = evaluate('src/features/app-content/repository.native.ts', {
    '@icao/contracts/app-content': evaluate('packages/contracts/src/app-content.ts', {}),
    'expo-crypto': { CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: async (_, value) => createHash('sha256').update(value).digest('hex') },
    '../../../content/app-content/text.json': json('content/app-content/text.json'),
    '../../../content/question-banks/opi-hotspots.json': json('content/question-banks/opi-hotspots.json'),
    '@/platform/api-client': { getApiBaseUrl: getBase, withApiRequestTimeout: (action) => action(undefined) },
    '@/platform/storage': { getItem: async (key) => storage.get(key), setItem: async (key, value) => storage.set(key, value) },
  }, { fetch });
  return { repository, fetch, getBase, storage };
}
const response = (data) => ({ ok: true, status: 200, json: async () => ({ data }) });
describe('native compatible content loading', () => {
  it('allows pre-login legal reading with built-in fallback when offline', async () => {
    const { repository, fetch } = fixture();
    const loaded = await repository.loadLegalDocuments();
    expect(loaded.documents).toEqual(repository.builtinAppContent.legal);
    expect(loaded.source).toBe('builtin'); expect(loaded.documents.agreement.sections.length).toBeGreaterThan(5);
    expect(fetch.mock.calls[0][1].headers.authorization).toBeUndefined();
  });
  it('refreshes on next entry and preserves an old snapshot already in use', async () => {
    const { repository, fetch } = fixture();
    const next = structuredClone(repository.builtinAppContent); next.version += 1; next.help[0].answer = '新的帮助正文';
    fetch.mockResolvedValueOnce(response(prepareAppContent(next)));
    const first = await repository.loadAppContent();
    expect(first.source).toBe('remote'); expect(first.data.version).toBe(next.version);
    const third = structuredClone(next); third.version += 1; third.help[0].answer = '第三版';
    fetch.mockResolvedValueOnce(response(prepareAppContent(third)));
    expect((await repository.loadAppContent()).data.version).toBe(third.version);
    expect(first.data.payload.help[0].answer).toBe('新的帮助正文');
    fetch.mockResolvedValueOnce({ status: 304 });
    expect((await repository.loadAppContent()).data.version).toBe(third.version);
    expect(fetch.mock.calls.at(-1)[1].headers['if-none-match']).toBe(`"${prepareAppContent(third).checksum}"`);
  });
  it('rejects partial/new-schema data and scopes cache to API environment', async () => {
    const { repository, fetch, getBase } = fixture();
    const good = structuredClone(repository.builtinAppContent); good.version += 1;
    fetch.mockResolvedValueOnce(response(prepareAppContent(good))); await repository.loadAppContent();
    fetch.mockResolvedValueOnce(response({ version: good.version + 1, checksum: '0'.repeat(64), payload: { ...good, version: good.version + 1, schemaVersion: 2 } }));
    expect((await repository.loadAppContent()).data.version).toBe(good.version);
    getBase.mockReturnValue('https://other.example.test');
    expect((await repository.loadAppContent()).source).toBe('builtin');
  });
});
describe('immutable native publication', () => {
  const ids = ['listening', 'sentences900', 'radiotelephony', 'opi', 'storytelling'];
  const file = { bankId: 'opi', objectKey: 'old.mp3', publicPath: '/question-bank-assets/audio/old.mp3', mimeType: 'audio/mpeg', sizeBytes: 10, checksum: 'a'.repeat(64), status: 'ready' };
  const manifest = { schemaVersion: 1, banks: ids.map((id) => ({ id })) };
  const datasets = new Map(ids.map((id) => [id, { id, categories: [{ id: 'c', topics: [{ id: 't', cards: [{ id: 'stable-question', audio: file.publicPath }] }] }] }]));
  it('pins bytes without changing original question identity or source data', () => {
    const next = prepareNativeContentRelease(manifest, { schemaVersion: 1, files: [file] }, datasets, 13);
    const card = next.banks[0].payload.categories[0].topics[0].cards[0];
    expect(card.id).toBe('stable-question'); expect(card.audio).toContain(file.checksum);
    expect(datasets.get(ids[0]).categories[0].topics[0].cards[0].audio).toBe(file.publicPath);
    const changed = prepareNativeContentRelease(manifest, { schemaVersion: 1, files: [{ ...file, checksum: 'b'.repeat(64) }] }, datasets, 14);
    expect(changed.files[0].publicPath).not.toBe(next.files[0].publicPath);
    expect(() => assertImmutableRelease({ checksum: 'old' }, { checksum: 'new' })).toThrow('content_release_version_immutable');
  });
  it('selects only the requested bank and referenced media, rejecting invalid scopes', () => {
    const next = prepareNativeContentRelease(manifest, { schemaVersion: 1, files: [file] }, datasets, 13);
    const selected = selectNativeContentBanks(next, ['sentences900']);
    expect(selected.banks.map((bank) => bank.id)).toEqual(['sentences900']);
    expect(selected.files).toHaveLength(1);
    expect(next.banks).toHaveLength(5);
    expect(() => selectNativeContentBanks(next, ['unknown'])).toThrow('invalid_selected_banks');
    expect(() => selectNativeContentBanks(next, ['opi', 'opi'])).toThrow('invalid_selected_banks');
    expect(() => selectNativeContentBanks({ ...next, files: [] }, ['opi'])).toThrow('selected_resource_missing');
  });
  it('rejects incomplete resources and unsafe paths before publishing', () => {
    expect(() => prepareNativeContentRelease(manifest, { schemaVersion: 1, files: [] }, datasets, 13)).toThrow('native_resource_reference_missing');
    expect(() => prepareNativeContentRelease(manifest, { schemaVersion: 1, files: [{ ...file, publicPath: '/question-bank-assets/../private' }] }, datasets, 13)).toThrow('invalid_native_resource');
  });
  it('does not reuse a legal document version with different text even after another release was active', () => {
    const original = json('content/app-content/text.json');
    const newer = structuredClone(original); newer.legal.privacy.version = 'v6.0';
    const reused = structuredClone(original); reused.legal.privacy.intro += '修改内容';
    expect(() => assertLegalDocumentVersions([original, newer], reused)).toThrow('legal_document_version_immutable');
    expect(() => assertLegalDocumentVersions([original, newer], original)).not.toThrow();
  });
});

function mediaFixture() {
  const values = new Map(), secure = new Map(), files = new Map(), downloads = new Map();
  const kv = { getItem: async (key) => values.get(key), setItem: async (key, value) => values.set(key, value),
    getAllKeys: async () => [...values.keys()], multiRemove: async (keys) => keys.forEach((key) => values.delete(key)) };
  class Directory {
    constructor(...parts) { this.uri = parts.map((part) => part.uri ?? part).join('/'); }
    create() {} get exists() { return [...files.keys()].some((key) => key.startsWith(this.uri)); }
    delete() { for (const key of files.keys()) if (key.startsWith(this.uri)) files.delete(key); }
    list() { return [...files.keys()].filter((key) => key.startsWith(`${this.uri}/`)).map((key) => new File(key)); }
  }
  class File {
    constructor(...parts) { this.uri = parts.map((part) => part.uri ?? part).join('/'); }
    get exists() { return files.has(this.uri); } get size() { return files.get(this.uri)?.length ?? 0; }
    get name() { return this.uri.split('/').at(-1); } get modificationTime() { return 0; }
    async bytes() { return files.get(this.uri); } delete() { files.delete(this.uri); }
    move(destination) {
      const bytes = files.get(this.uri);
      files.delete(this.uri);
      this.uri = destination.uri;
      files.set(this.uri, bytes);
    }
    static async downloadFileAsync(url, file) { files.set(file.uri, downloads.get(url)); }
  }
  const crypto = { AESKeySize: { AES256: 256 }, AESEncryptionKey: { generate: async () => ({ encoded: async () => 'key' }), import: async () => ({}) },
    AESSealedData: { fromCombined: (value) => value },
    aesEncryptAsync: async (bytes) => ({ combined: async () => Buffer.from(bytes).toString('base64') }),
    aesDecryptAsync: async (value) => new Uint8Array(Buffer.from(value, 'base64')),
    CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: async (_, value) => createHash('sha256').update(value).digest('hex'),
    digest: async (_, bytes) => { const hash = new Uint8Array(createHash('sha256').update(bytes).digest()); return hash.buffer; } };
  const repository = evaluate('src/features/question-bank/data/member-content-cache.native.ts', {
    'expo-crypto': crypto, 'expo-file-system': { Directory, File, Paths: { document: 'file:/test', cache: 'file:/cache' } }, '@/platform/storage': kv,
    'expo-secure-store': { getItemAsync: async (key) => secure.get(key), setItemAsync: async (key, value) => secure.set(key, value), deleteItemAsync: async (key) => secure.delete(key) },
    '@/features/native-commercial-testflight/commerce-environment': { getNativeCommerceEnvironment: () => 'production', nativeCommerceEnvironmentSnapshot: () => 'production' },
    './content-credential-verifier.native': { verifyContentAccessCredential: () => true, inspectContentAccessCredential: () => 'valid' },
  }, { TextEncoder, TextDecoder, Uint8Array });
  return { repository, downloads, files };
}

describe('versioned native media cache', () => {
  const metadata = (bytes) => ({ checksum: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length });
  const path = '/question-bank-assets/audio/topic.mp3';
  async function start(fixture) {
    await fixture.repository.activateQuestionBankContentAccount('account-a');
    await fixture.repository.writeMemberTopicCache('account-a', { bankId: 'opi', categoryId: 'category', topicId: 'topic' },
      { id: 'topic', cards: [{ id: 'card', audio: path }] }, { environment: 'production' });
  }
  it('gives revised bytes a distinct file and clears access on account switch', async () => {
    const fixture = mediaFixture(); await start(fixture);
    const oldBytes = Buffer.from('old audio'), nextBytes = Buffer.from('new audio');
    fixture.downloads.set('old', oldBytes); fixture.downloads.set('next', nextBytes);
    const oldUri = await fixture.repository.cacheMemberResource(path, 'old', metadata(oldBytes));
    const nextUri = await fixture.repository.cacheMemberResource(path, 'next', metadata(nextBytes));
    expect(oldUri).not.toBe(nextUri); expect(await fixture.repository.resolveOfflineMemberResource(path)).toBe(nextUri);
    await fixture.repository.activateQuestionBankContentAccount('account-b');
    expect(await fixture.repository.resolveOfflineMemberResource(path)).toBeUndefined();
  });
  it('does not retain partial or checksum-invalid media as playable cache', async () => {
    const fixture = mediaFixture(); await start(fixture);
    fixture.downloads.set('corrupt', Buffer.from('bad'));
    await expect(fixture.repository.cacheMemberResource(path, 'corrupt', metadata(Buffer.from('valid')))).rejects.toThrow('resource_size_mismatch');
    expect(fixture.files.size).toBe(0);
    await expect(fixture.repository.cacheMemberResource(path, 'corrupt', metadata(Buffer.from('yes')))).rejects.toThrow('resource_checksum_mismatch');
    expect(fixture.files.size).toBe(0); expect(await fixture.repository.resolveOfflineMemberResource(path)).toBeUndefined();
  });
});

describe('native legal receipts offline', () => {
  it('keeps the exact accepted documents if public cache is older and never records a failed acceptance', async () => {
    const values = new Map(); const api = vi.fn(); const fixedApi = vi.fn();
    const contracts = evaluate('packages/contracts/src/app-content.ts', {});
    const current = { ...json('content/app-content/text.json'), hotspots: json('content/question-banks/opi-hotspots.json') };
    class ApiError extends Error { constructor(code, status) { super(code); this.status = status; } }
    const module = evaluate('src/features/app-content/legal-consent.native.ts', {
      '@icao/contracts/app-content': contracts,
      '@/platform/api-client': { ApiClientError: ApiError, getApiBaseUrl: () => 'https://api.test', apiRequest: api,
        apiAccessToken: async () => 'account-a-token', apiRequestWithAccessToken: fixedApi,
        withApiRequestTimeout: (action) => action(undefined) },
      '@/platform/storage': { getItem: async (key) => values.get(key), setItem: async (key, value) => values.set(key, value), removeItem: async (key) => values.delete(key) },
      './repository.native': { readAvailableLegalDocuments: async () => ({ documents: current.legal, releaseVersion: 1 }) },
    });
    const documents = structuredClone(current.legal);
    documents.privacy.version = 'v6.0'; documents.privacy.consentVersion = 'v6.0';
    const receipt = { accountId: 'account-a', agreementVersion: documents.agreement.version, privacyVersion: 'v6.0', agreementConsentVersion: documents.agreement.consentVersion, privacyConsentVersion: 'v6.0', releaseVersion: 2, acceptedAt: '2026-09-10T00:00:00Z' };
    fixedApi.mockResolvedValueOnce(receipt);
    await module.acceptLegalDocuments('account-a', documents);
    expect(fixedApi.mock.calls[0][1]).toBe('account-a-token');
    expect(api).not.toHaveBeenCalled();
    api.mockRejectedValue(new Error('offline'));
    const cached = await module.getLegalConsentStatus('account-a');
    expect(cached.required).toBe(false); expect(cached.privacy.version).toBe('v6.0');
    expect((await module.getLegalConsentStatus('account-b')).required).toBe(true);
    fixedApi.mockRejectedValueOnce(new Error('offline'));
    await expect(module.acceptLegalDocuments('account-b', documents)).rejects.toThrow('offline');
    expect((await module.getLegalConsentStatus('account-b')).receipt).toBeNull();
    api.mockRejectedValueOnce(new ApiError('invalid_token', 401));
    await expect(module.getLegalConsentStatus('account-a')).rejects.toThrow('invalid_token');
  });
});

it('blocks loss of published center/question provenance in an unrelated content update', () => {
  const source = { id: 'source', centers: ['北京'], topics: [{ topicId: 'weather', cardIds: ['one'] }] };
  const prior = { hotspots: { briefs: [{ sources: [source] }] } };
  expect(() => assertHotspotSourcesPreserved(prior, { hotspots: { briefs: [{}] } })).toThrow('hotspot_source_relations_must_be_preserved');
  expect(() => assertHotspotSourcesPreserved(prior, structuredClone(prior))).not.toThrow();
});
