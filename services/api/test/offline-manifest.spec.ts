import { describe, expect, it, vi } from 'vitest';
import { ContentAccessService } from '../src/content-access/content-access.service';
import type { DatabaseService } from '../src/database/database.service';
import type { ApiConfig } from '../src/config';
const path = '/question-bank-assets/audio/shared.mp3';
function fixture() {
  const dataset = { id: 'listening', categories: [{ id: 'c', name: '模块', topics: [{ id: 't', name: '题组', declaredCardCount: 3,
    cards: [{ id: 'a', studyTier: 1, audio: path }, { id: 'b', studyTier: 2, audio: path }, { id: 'outside', studyTier: 0, audioText: 'old' }] }] }] };
  const rows = [{ sourcePath: path, checksum: 'a'.repeat(64), sizeBytes: 123 }];
  const database = { db: { select: () => ({ from: () => ({ where: () => ({ orderBy: async () => rows }) }) }) } } as unknown as DatabaseService;
  const service = new ContentAccessService({} as ApiConfig, database);
  const internal = service as unknown as { activeRelease: () => Promise<unknown>; assertEnvironmentAuthorized: () => Promise<void> };
  vi.spyOn(internal, 'activeRelease').mockImplementation(async () => ({ bankId: dataset.id, version: 1, checksum: 'b'.repeat(64), dataset }));
  const authorize = vi.spyOn(internal, 'assertEnvironmentAuthorized').mockResolvedValue(undefined);
  return { service, dataset, rows, authorize };
}
describe('offline manifests', () => {
  it('deduplicates shared audio and includes text bytes without exposing question text', async () => {
    const { service } = fixture();
    const manifest = await service.offlineManifest('listening', 'selected', 'account', 'session', 'production');
    expect(manifest.topics[0]!.cardIds).toEqual(['a', 'b']);
    expect(manifest.resources).toHaveLength(1);
    expect(manifest.sizeBytes).toBe(manifest.topics[0]!.sizeBytes + 123);
    expect(JSON.stringify(manifest)).not.toContain('audioText');
  });
  it('does not invalidate selected content for changes outside its range', async () => {
    const { service, dataset } = fixture();
    const before = await service.offlineManifest('listening', 'selected', 'account', 'session', 'production');
    dataset.categories[0]!.topics[0]!.cards[2]!.audioText = 'different outside answer';
    const after = await service.offlineManifest('listening', 'selected', 'account', 'session', 'production');
    expect(after.fingerprint).toBe(before.fingerprint);
    dataset.categories[0]!.topics[0]!.cards[0]!.audioText = 'selected edit';
    expect((await service.offlineManifest('listening', 'selected', 'account', 'session', 'production')).fingerprint).not.toBe(before.fingerprint);
  });
  it('rejects incomplete resources and invalid scope, and retains the environment guard', async () => {
    const { service, rows, authorize } = fixture();
    rows.length = 0;
    await expect(service.offlineManifest('listening', 'selected', 'a', 's', 'production')).rejects.toThrow('download_resource_unavailable');
    await expect(service.offlineManifest('listening', 'icao4', 'a', 's', 'production')).rejects.toThrow('invalid_download_scope');
    authorize.mockRejectedValue(new Error('sandbox denied'));
    await expect(service.offlineManifest('listening', 'selected', 'a', 's', 'sandbox')).rejects.toThrow('sandbox denied');
  });
});

it('detects added/deleted questions and same-path audio replacement without changing unrelated scopes', async () => {
  const { service, dataset, rows } = fixture();
  const load = () => service.offlineManifest('listening', 'selected', 'a', 's', 'production');
  const original = await load();
  dataset.categories[0]!.topics[0]!.cards.push({ id: 'new', studyTier: 1, audio: path });
  const added = await load();
  expect(added.topics[0]!.cardIds).toContain('new');
  expect(added.fingerprint).not.toBe(original.fingerprint);
  dataset.categories[0]!.topics[0]!.cards.splice(0, 1);
  const removed = await load();
  expect(removed.topics[0]!.cardIds).not.toContain('a');
  expect(removed.fingerprint).not.toBe(added.fingerprint);
  rows[0]!.checksum = 'f'.repeat(64);
  const audio = await load();
  expect(audio.fingerprint).not.toBe(removed.fingerprint);
  expect(audio.resources[0]!.publicPath).toBe(path);
});
