import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { canonicalAppContentJson, isAppContentSnapshot, type AppContentSnapshot } from '@icao/contracts/app-content';
import { AppContentService, appContentChecksum } from '../src/app-content/app-content.service';
import { AppContentController } from '../src/app-content/app-content.controller';

const snapshot = {
  ...JSON.parse(readFileSync(join(__dirname, '../../../content/app-content/text.json'), 'utf8')),
  hotspots: JSON.parse(readFileSync(join(__dirname, '../../../content/question-banks/opi-hotspots.json'), 'utf8')),
} as AppContentSnapshot;
function serviceWith(payload: unknown = snapshot, checksum = appContentChecksum(payload)) {
  const limit = vi.fn().mockResolvedValue([{ version: snapshot.version, checksum, payload }]);
  const chain = { from: () => chain, where: () => chain, orderBy: () => chain, limit };
  return new AppContentService({ db: { select: () => chain } } as never);
}

describe('fixed public app content', () => {
  it('accepts complete built-in version and canonicalizes JSONB key order', () => {
    expect(isAppContentSnapshot(snapshot)).toBe(true);
    expect(canonicalAppContentJson({ b: 1, a: 2 })).toBe(canonicalAppContentJson({ a: 2, b: 1 }));
  });
  it('rejects new schemas, duplicate periods, paid question bodies and executable extensions', () => {
    expect(isAppContentSnapshot({ ...snapshot, schemaVersion: 2 })).toBe(false);
    expect(isAppContentSnapshot({ ...snapshot, script: 'alert(1)' })).toBe(false);
    const duplicate = structuredClone(snapshot); duplicate.hotspots.briefs.push(duplicate.hotspots.briefs[0]!);
    expect(isAppContentSnapshot(duplicate)).toBe(false);
    const paidBody = structuredClone(snapshot); Object.assign(paidBody.hotspots.briefs[0]!.topics[0]!, { cards: [{ text: 'private' }] });
    expect(isAppContentSnapshot(paidBody)).toBe(false);
  });
  it('rejects corrupt release atomically', async () => {
    await expect(serviceWith(snapshot, 'a'.repeat(64)).get()).rejects.toThrow('app_content_checksum_mismatch');
    await expect(serviceWith({ ...snapshot, schemaVersion: 2 }).get()).rejects.toThrow('app_content_release_invalid');
  });
  it('serves metadata with revalidation and returns 304 for exact content', async () => {
    const controller = new AppContentController(serviceWith());
    const reply = { header: vi.fn().mockReturnThis(), status: vi.fn() };
    const data = await controller.get(undefined, { id: 'test' } as never, reply as never);
    expect(data?.data.payload.legal.agreement.version).toBe(snapshot.legal.agreement.version);
    expect(reply.header).toHaveBeenCalledWith('cache-control', 'public, max-age=0, must-revalidate');
    expect(await controller.get(`"${data?.data.checksum}"`, { id: 'test' } as never, reply as never)).toBeUndefined();
    expect(reply.status).toHaveBeenCalledWith(304);
  });
  it('omits removed controls and old local-data merge wording', () => {
    expect(JSON.stringify(snapshot.legal)).not.toMatch(/导出账号|退出全部设备|手动同步|确认旧本机数据归属/);
    expect(snapshot.legal.privacy.sections.some((clause) => clause.body.includes('不保存用户录音'))).toBe(true);
  });
});
