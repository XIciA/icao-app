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
    const controller = new AppContentController(serviceWith(), {} as never);
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

it('keeps separate date/center entries for v2 and a readable merged projection for older clients', async () => {
  const value=structuredClone(snapshot);
  const first=value.hotspots.briefs[0]!;
  value.hotspots.briefs=[{...first,id:'center-a',centers:['A']},{...first,id:'center-b',centers:['B']}];
  const controller=new AppContentController(serviceWith(value), {} as never);
  const reply={header:vi.fn().mockReturnThis(),status:vi.fn()};
  const modern=await controller.get(undefined,{id:'new',query:{hotspotFormat:'2'}} as never,reply as never);
  const legacy=await controller.get(undefined,{id:'old',query:{}} as never,reply as never);
  expect(modern?.data.payload.hotspots.briefs).toHaveLength(2);
  expect(legacy?.data.payload.hotspots.briefs).toHaveLength(1);
  expect(legacy?.data.payload.hotspots.briefs[0]?.centers).toEqual(['A','B']);
  expect(legacy?.data.checksum).not.toBe(modern?.data.checksum);
  expect(legacy?.data.checksum).toBe(appContentChecksum(legacy?.data.payload));
});

it('serves provenance only to v3 while keeping v2 reference keys and legacy date summaries compatible',async()=>{
 const {normalizeDailyHotspots}=await import('@icao/contracts/app-content');
 const value=structuredClone(snapshot);const b=value.hotspots.briefs[0]!;
 value.hotspots.briefs=normalizeDailyHotspots([{...b,id:'a',centers:['A']},{...b,id:'b',centers:['B']}]);
 const controller=new AppContentController(serviceWith(value), {} as never),reply={header:vi.fn().mockReturnThis(),status:vi.fn()};
 const current=await controller.get(undefined,{id:'new',query:{hotspotFormat:'3'}} as never,reply as never);
 const v2=await controller.get(undefined,{id:'old',query:{hotspotFormat:'2'}} as never,reply as never);
 expect(current?.data.payload.hotspots.briefs).toHaveLength(1);expect(current?.data.payload.hotspots.briefs[0]?.sources).toHaveLength(2);
 expect(v2?.data.payload.hotspots.briefs).toHaveLength(2);expect(v2?.data.payload.hotspots.briefs.every(b=>!('sources' in b))).toBe(true);
 expect(isAppContentSnapshot(v2?.data.payload)).toBe(true);
});
