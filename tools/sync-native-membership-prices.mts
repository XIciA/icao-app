import { execFileSync } from 'node:child_process';
import { ACTIVE_MEMBERSHIP_PRODUCTS } from '../services/api/src/commerce/product-catalog.ts';
import { appStoreConnectApi as api, appStoreConnectAppContext, appStoreConnectCredentials } from './lib/app-store-connect-api.mjs';

// Read-only by default. Apply only the reviewed active catalog from clean main.
const apply = process.argv.includes('--apply');
if (apply) execFileSync(process.execPath, ['tools/check-mainline-release.mjs'], { stdio: 'inherit' });
const credentials = await appStoreConnectCredentials();
const { appId } = await appStoreConnectAppContext(credentials, process.cwd());

async function pages(path: string) {
  const items: any[] = [];
  const visited = new Set<string>();
  while (path) {
    if (visited.has(path) || visited.size >= 50) throw new Error('Unexpected App Store pagination');
    visited.add(path);
    const response = await api(credentials, path);
    items.push(...(response.data ?? []));
    const next = response.links?.next ? new URL(response.links.next) : undefined;
    if (next && next.origin !== 'https://api.appstoreconnect.apple.com') throw new Error('Unexpected pagination origin');
    path = next ? next.pathname + next.search : '';
  }
  return items;
}

async function currentPrice(id: string) {
  const schedule = await api(credentials, `/v2/inAppPurchases/${id}/iapPriceSchedule`);
  const response = await api(credentials, `/v1/inAppPurchasePriceSchedules/${schedule.data.id}/manualPrices?filter%5Bterritory%5D=CHN&include=inAppPurchasePricePoint&limit=200`);
  const current = response.data.filter((entry: any) => entry.attributes.startDate === null && entry.attributes.endDate === null);
  if (current.length !== 1) throw new Error('Expected one current mainland China price');
  const pointId = current[0].relationships.inAppPurchasePricePoint.data.id;
  return Number(response.included.find((point: any) => point.id === pointId)?.attributes.customerPrice);
}

const remote = await pages(`/v1/apps/${appId}/inAppPurchasesV2?limit=200`);
for (const product of ACTIVE_MEMBERSHIP_PRODUCTS) {
  const item = remote.find(entry => entry.attributes.productId === product.appleProductId);
  if (!item || item.attributes.inAppPurchaseType !== 'NON_RENEWING_SUBSCRIPTION') throw new Error(`Product contract mismatch: ${product.productKey}`);
  const target = product.basePriceCnyFen / 100;
  const before = await currentPrice(item.id);
  if (apply && before !== target) {
    const points = await pages(`/v2/inAppPurchases/${item.id}/pricePoints?filter%5Bterritory%5D=CHN&limit=200`);
    const exact = points.find(point => Number(point.attributes.customerPrice) === target);
    if (!exact) throw new Error(`Approved exact price is unavailable: ${product.productKey}`);
    const priceId = '${initial-price}';
    await api(credentials, '/v1/inAppPurchasePriceSchedules', { method: 'POST', body: JSON.stringify({
      data: { type: 'inAppPurchasePriceSchedules', relationships: {
        inAppPurchase: { data: { type: 'inAppPurchases', id: item.id } },
        baseTerritory: { data: { type: 'territories', id: 'CHN' } },
        manualPrices: { data: [{ type: 'inAppPurchasePrices', id: priceId }] },
      } },
      included: [{ type: 'inAppPurchasePrices', id: priceId, attributes: { startDate: null }, relationships: {
        inAppPurchaseV2: { data: { type: 'inAppPurchases', id: item.id } },
        inAppPurchasePricePoint: { data: { type: 'inAppPurchasePricePoints', id: exact.id } },
      } }],
    }) });
  }
  const actual = apply ? await currentPrice(item.id) : before;
  console.log(JSON.stringify({ productKey: product.productKey, targetCny: target, actualCny: actual, matches: actual === target, applied: apply && before !== actual }));
  if (apply && actual !== target) throw new Error(`Price update was not confirmed: ${product.productKey}`);
}
