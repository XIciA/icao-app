import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  appStoreConnectApi as api,
  appStoreConnectAppContext,
  appStoreConnectCredentials,
} from './lib/app-store-connect-api.mjs';

const root = process.cwd();
const command = process.argv[2];
const fieldsPath = path.join(
  root,
  'docs/workstreams/app-store-1.0.0/materials/app-store-connect-final-fields.md',
);
const notificationUrl = 'https://api.readyoufife.com/v1/commerce/apple/notifications/v2';

async function paged(credentials, pathname) {
  const data = [];
  let nextPath = pathname;
  const visited = new Set();
  let pageCount = 0;
  while (nextPath) {
    if (visited.has(nextPath)) {
      throw new Error('App Store Connect returned a pagination loop.');
    }
    if (pageCount >= 50) {
      throw new Error('App Store Connect pagination exceeded the 50-page safety limit.');
    }
    visited.add(nextPath);
    pageCount += 1;
    const result = await api(credentials, nextPath);
    data.push(...(result.data ?? []));
    const next = result.links?.next;
    if (!next) break;
    const nextUrl = new URL(next);
    if (nextUrl.origin !== 'https://api.appstoreconnect.apple.com') {
      throw new Error('App Store Connect returned an unexpected pagination origin.');
    }
    nextPath = `${nextUrl.pathname}${nextUrl.search}`;
  }
  return data;
}

function cleanCell(value) {
  return value.trim().replace(/^`|`$/gu, '');
}

function productContract(source) {
  const block = source.match(/<!-- iap-products:start -->([\s\S]+?)<!-- iap-products:end -->/u)?.[1];
  if (!block) throw new Error('The App Store field package is missing its IAP product block.');
  const products = block.split('\n')
    .filter((line) => /^\|\s*\d+\s*\|/u.test(line))
    .map((line) => {
      const cells = line.split('|').slice(1, -1).map(cleanCell);
      if (cells.length !== 8) throw new Error('The App Store IAP table has an unexpected structure.');
      const days = Number(cells[0]);
      const targetPriceCny = Number(cells[5].replace(/^¥/u, ''));
      const reviewNotePattern = new RegExp(
        `<!-- field:iap-review-notes-${days} -->\\n` + '```text\\n([\\s\\S]+?)\\n```',
        'u',
      );
      const reviewNote = source.match(reviewNotePattern)?.[1].trim();
      if (!Number.isInteger(days) || !Number.isFinite(targetPriceCny) || !reviewNote) {
        throw new Error(`The App Store IAP contract is incomplete for ${cells[2] || 'an unknown product'}.`);
      }
      return {
        days,
        referenceName: cells[1],
        productId: cells[2],
        displayName: cells[3],
        description: cells[4],
        targetPriceCny,
        entitlementKey: cells[6],
        reviewScreenshot: cells[7],
        reviewNote,
      };
    });
  if (products.length !== 5 || new Set(products.map((product) => product.productId)).size !== 5) {
    throw new Error('The App Store field package must define exactly five unique IAP products.');
  }
  return products;
}

async function listProducts(credentials, appId) {
  return paged(
    credentials,
    `/v1/apps/${encodeURIComponent(appId)}/inAppPurchasesV2?limit=200`,
  );
}

async function listLocalizations(credentials, productId) {
  return paged(
    credentials,
    `/v2/inAppPurchases/${encodeURIComponent(productId)}/inAppPurchaseLocalizations?limit=50`,
  );
}

async function optionalRelationship(credentials, pathname) {
  return api(credentials, pathname, { acceptedStatuses: [404] });
}

async function territories(credentials) {
  const values = await paged(credentials, '/v1/territories?limit=200');
  if (values.length < 150 || !values.some((territory) => territory.id === 'CHN')) {
    throw new Error('App Store Connect returned an incomplete territory catalog.');
  }
  return values;
}

async function chinaPricePoint(credentials, productId, targetPriceCny) {
  const pricePoints = await paged(
    credentials,
    `/v2/inAppPurchases/${encodeURIComponent(productId)}/pricePoints?filter%5Bterritory%5D=CHN&limit=200`,
  );
  const candidates = pricePoints
    .map((pricePoint) => ({ pricePoint, value: Number(pricePoint.attributes?.customerPrice) }))
    .filter((candidate) => Number.isFinite(candidate.value) && candidate.value <= targetPriceCny)
    .sort((left, right) => right.value - left.value);
  if (candidates.length === 0) {
    throw new Error(`No China mainland price point is at or below CNY ${targetPriceCny}.`);
  }
  return candidates[0];
}

async function scheduleChinaPrice(credentials, scheduleId) {
  if (!scheduleId) return null;
  const manualPrices = await api(
    credentials,
    `/v1/inAppPurchasePriceSchedules/${encodeURIComponent(scheduleId)}/manualPrices?filter%5Bterritory%5D=CHN&include=inAppPurchasePricePoint&limit=200`,
  );
  const currentPrices = (manualPrices.data ?? [])
    .filter((price) => price.attributes?.startDate == null);
  if (currentPrices.length > 1) {
    throw new Error('App Store Connect returned multiple current China mainland manual prices.');
  }
  const pricePointId = currentPrices[0]?.relationships?.inAppPurchasePricePoint?.data?.id;
  const value = (manualPrices.included ?? [])
    .find((included) => included.type === 'inAppPurchasePricePoints' && included.id === pricePointId)
    ?.attributes?.customerPrice;
  return value == null ? null : Number(value);
}

async function scheduleBaseTerritory(credentials, scheduleId) {
  if (!scheduleId) return null;
  const base = await api(
    credentials,
    `/v1/inAppPurchasePriceSchedules/${encodeURIComponent(scheduleId)}/baseTerritory`,
  );
  return base.data?.id ?? null;
}

async function availabilityTerritories(credentials, availabilityId) {
  if (!availabilityId) return [];
  return paged(
    credentials,
    `/v1/inAppPurchaseAvailabilities/${encodeURIComponent(availabilityId)}/relationships/availableTerritories?limit=200`,
  );
}

function sameTerritories(actual, expected) {
  if (actual.length !== expected.length) return false;
  const expectedIds = new Set(expected.map((territory) => territory.id));
  return actual.every((territory) => expectedIds.has(territory.id));
}

function createProductBody(appId, product) {
  return {
    data: {
      type: 'inAppPurchases',
      attributes: {
        name: product.referenceName,
        productId: product.productId,
        inAppPurchaseType: 'NON_RENEWING_SUBSCRIPTION',
        reviewNote: product.reviewNote,
        familySharable: false,
      },
      relationships: {
        app: { data: { type: 'apps', id: appId } },
      },
    },
  };
}

function createLocalizationBody(productId, product) {
  return {
    data: {
      type: 'inAppPurchaseLocalizations',
      attributes: {
        locale: 'zh-Hans',
        name: product.displayName,
        description: product.description,
      },
      relationships: {
        inAppPurchaseV2: { data: { type: 'inAppPurchases', id: productId } },
      },
    },
  };
}

function updateLocalizationBody(localizationId, product) {
  return {
    data: {
      type: 'inAppPurchaseLocalizations',
      id: localizationId,
      attributes: {
        name: product.displayName,
        description: product.description,
      },
    },
  };
}

function availabilityBody(productId, territoryCatalog) {
  return {
    data: {
      type: 'inAppPurchaseAvailabilities',
      attributes: { availableInNewTerritories: true },
      relationships: {
        inAppPurchase: { data: { type: 'inAppPurchases', id: productId } },
        availableTerritories: {
          data: territoryCatalog.map((territory) => ({ type: 'territories', id: territory.id })),
        },
      },
    },
  };
}

function priceScheduleBody(productId, pricePointId) {
  const priceId = '${initial-price}';
  return {
    data: {
      type: 'inAppPurchasePriceSchedules',
      relationships: {
        inAppPurchase: { data: { type: 'inAppPurchases', id: productId } },
        baseTerritory: { data: { type: 'territories', id: 'CHN' } },
        manualPrices: { data: [{ type: 'inAppPurchasePrices', id: priceId }] },
      },
    },
    included: [{
      type: 'inAppPurchasePrices',
      id: priceId,
      attributes: { startDate: null },
      relationships: {
        inAppPurchaseV2: { data: { type: 'inAppPurchases', id: productId } },
        inAppPurchasePricePoint: {
          data: { type: 'inAppPurchasePricePoints', id: pricePointId },
        },
      },
    }],
  };
}

async function status(credentials, appId, contract) {
  const remote = await listProducts(credentials, appId);
  const byProductId = new Map(remote.map((product) => [product.attributes?.productId, product]));
  const states = contract.map((product) => {
    const current = byProductId.get(product.productId);
    return {
      productId: product.productId,
      exists: Boolean(current),
      state: current?.attributes?.state ?? null,
      type: current?.attributes?.inAppPurchaseType ?? null,
    };
  });
  console.log(JSON.stringify({ configured: states.filter((item) => item.exists).length, expected: 5, products: states }));
}

async function syncProducts(credentials, appId, contract) {
  if (process.env.ICAO_APP_STORE_CONNECT_WRITE !== '1') {
    throw new Error('Set ICAO_APP_STORE_CONNECT_WRITE=1 to create or update App Store Connect products.');
  }
  const initial = await listProducts(credentials, appId);
  const byProductId = new Map(initial.map((product) => [product.attributes?.productId, product]));
  let created = 0;
  let localized = 0;
  let localizationUpdated = 0;
  for (const product of contract) {
    let current = byProductId.get(product.productId);
    if (!current) {
      const result = await api(credentials, '/v2/inAppPurchases', {
        method: 'POST',
        body: JSON.stringify(createProductBody(appId, product)),
      });
      current = result.data;
      created += 1;
    }
    if (current.attributes?.inAppPurchaseType !== 'NON_RENEWING_SUBSCRIPTION') {
      throw new Error(`App Store product uses the wrong immutable type: ${product.productId}`);
    }
    if (current.attributes?.name !== product.referenceName
      || current.attributes?.reviewNote !== product.reviewNote) {
      await api(credentials, `/v2/inAppPurchases/${encodeURIComponent(current.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          data: {
            type: 'inAppPurchases',
            id: current.id,
            attributes: { name: product.referenceName, reviewNote: product.reviewNote },
          },
        }),
      });
    }
    const localizations = await listLocalizations(credentials, current.id);
    const simplifiedChinese = localizations.find(
      (localization) => localization.attributes?.locale === 'zh-Hans',
    );
    if (!simplifiedChinese) {
      await api(credentials, '/v1/inAppPurchaseLocalizations', {
        method: 'POST',
        body: JSON.stringify(createLocalizationBody(current.id, product)),
      });
      localized += 1;
    } else if (simplifiedChinese.attributes?.name !== product.displayName
      || simplifiedChinese.attributes?.description !== product.description) {
      await api(credentials, `/v1/inAppPurchaseLocalizations/${encodeURIComponent(simplifiedChinese.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(updateLocalizationBody(simplifiedChinese.id, product)),
      });
      localizationUpdated += 1;
    }
  }
  const final = await listProducts(credentials, appId);
  const expectedIds = new Set(contract.map((product) => product.productId));
  const configured = final.filter((product) => expectedIds.has(product.attributes?.productId));
  if (configured.length !== 5) throw new Error('App Store Connect does not contain all five frozen IAP products.');
  console.log(`App Store IAP metadata synchronized: created=${created}, localized=${localized}, updated=${localizationUpdated}.`);
}

async function syncCommercial(credentials, appId, contract) {
  if (process.env.ICAO_APP_STORE_CONNECT_WRITE !== '1') {
    throw new Error('Set ICAO_APP_STORE_CONNECT_WRITE=1 to configure App Store Connect commerce.');
  }
  const remote = await listProducts(credentials, appId);
  const byProductId = new Map(remote.map((product) => [product.attributes?.productId, product]));
  const territoryCatalog = await territories(credentials);
  let availabilityCreated = 0;
  let availabilityUpdated = 0;
  let pricesCreated = 0;
  let pricesUpdated = 0;
  const actualPrices = [];
  for (const product of contract) {
    const current = byProductId.get(product.productId);
    if (!current || current.attributes?.inAppPurchaseType !== 'NON_RENEWING_SUBSCRIPTION') {
      throw new Error(`Create and verify the frozen product before commercial setup: ${product.productId}`);
    }
    const availability = await optionalRelationship(
      credentials,
      `/v2/inAppPurchases/${encodeURIComponent(current.id)}/inAppPurchaseAvailability`,
    );
    const currentTerritories = await availabilityTerritories(credentials, availability?.data?.id);
    const availabilityMatches = availability?.data?.attributes?.availableInNewTerritories === true
      && sameTerritories(currentTerritories, territoryCatalog);
    if (!availabilityMatches) {
      await api(credentials, '/v1/inAppPurchaseAvailabilities', {
        method: 'POST',
        body: JSON.stringify(availabilityBody(current.id, territoryCatalog)),
      });
      if (availability?.data) availabilityUpdated += 1;
      else availabilityCreated += 1;
    }
    const schedule = await optionalRelationship(
      credentials,
      `/v2/inAppPurchases/${encodeURIComponent(current.id)}/iapPriceSchedule`,
    );
    const existingPrice = await scheduleChinaPrice(credentials, schedule?.data?.id);
    const existingBaseTerritory = await scheduleBaseTerritory(credentials, schedule?.data?.id);
    const selected = await chinaPricePoint(credentials, current.id, product.targetPriceCny);
    if (!Number.isFinite(existingPrice)
      || existingPrice !== selected.value
      || existingBaseTerritory !== 'CHN') {
      await api(credentials, '/v1/inAppPurchasePriceSchedules', {
        method: 'POST',
        body: JSON.stringify(priceScheduleBody(current.id, selected.pricePoint.id)),
      });
      if (Number.isFinite(existingPrice)) pricesUpdated += 1;
      else pricesCreated += 1;
    }
    actualPrices.push({ productId: product.productId, customerPriceCny: selected.value });
  }
  console.log(JSON.stringify({
    availabilityCreated,
    availabilityUpdated,
    pricesCreated,
    pricesUpdated,
    actualPrices,
    territoryCount: territoryCatalog.length,
  }));
}

async function commercialStatus(credentials, appId, contract) {
  const remote = await listProducts(credentials, appId);
  const byProductId = new Map(remote.map((product) => [product.attributes?.productId, product]));
  const products = [];
  for (const product of contract) {
    const current = byProductId.get(product.productId);
    if (!current) {
      products.push({ productId: product.productId, exists: false });
      continue;
    }
    const availability = await optionalRelationship(
      credentials,
      `/v2/inAppPurchases/${encodeURIComponent(current.id)}/inAppPurchaseAvailability`,
    );
    const availableTerritories = await availabilityTerritories(credentials, availability?.data?.id);
    const schedule = await optionalRelationship(
      credentials,
      `/v2/inAppPurchases/${encodeURIComponent(current.id)}/iapPriceSchedule`,
    );
    let priceCny = null;
    let baseTerritory = null;
    const selected = await chinaPricePoint(credentials, current.id, product.targetPriceCny);
    if (schedule?.data) {
      priceCny = await scheduleChinaPrice(credentials, schedule.data.id);
      baseTerritory = await scheduleBaseTerritory(credentials, schedule.data.id);
    }
    products.push({
      productId: product.productId,
      exists: true,
      state: current.attributes?.state ?? null,
      availableInNewTerritories: availability?.data?.attributes?.availableInNewTerritories ?? null,
      availableTerritoryCount: availableTerritories.length,
      baseTerritory,
      priceCny,
      plannedPriceCny: selected.value,
      targetPriceCny: product.targetPriceCny,
    });
  }
  console.log(JSON.stringify({ products }));
}

async function readNotificationAttributes(credentials, appId) {
  const fields = [
    'subscriptionStatusUrl',
    'subscriptionStatusUrlVersion',
    'subscriptionStatusUrlForSandbox',
    'subscriptionStatusUrlVersionForSandbox',
  ].join('%2C');
  const result = await api(credentials, `/v1/apps/${encodeURIComponent(appId)}?fields%5Bapps%5D=${fields}`);
  return result.data?.attributes ?? {};
}

function notificationSummary(attributes) {
  return {
    productionUrl: attributes.subscriptionStatusUrl ?? null,
    productionVersion: attributes.subscriptionStatusUrlVersion ?? null,
    sandboxUrl: attributes.subscriptionStatusUrlForSandbox ?? null,
    sandboxVersion: attributes.subscriptionStatusUrlVersionForSandbox ?? null,
  };
}

function notificationsMatch(attributes) {
  return attributes.subscriptionStatusUrl === notificationUrl
    && attributes.subscriptionStatusUrlVersion === 'V2'
    && attributes.subscriptionStatusUrlForSandbox === notificationUrl
    && attributes.subscriptionStatusUrlVersionForSandbox === 'V2';
}

async function notificationStatus(credentials, appId) {
  const attributes = await readNotificationAttributes(credentials, appId);
  console.log(JSON.stringify({
    ...notificationSummary(attributes),
  }));
  return attributes;
}

async function syncNotifications(credentials, appId) {
  if (process.env.ICAO_APP_STORE_CONNECT_WRITE !== '1') {
    throw new Error('Set ICAO_APP_STORE_CONNECT_WRITE=1 to configure App Store notifications.');
  }
  await api(credentials, `/v1/apps/${encodeURIComponent(appId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      data: {
        type: 'apps',
        id: appId,
        attributes: {
          subscriptionStatusUrl: notificationUrl,
          subscriptionStatusUrlVersion: 'V2',
          subscriptionStatusUrlForSandbox: notificationUrl,
          subscriptionStatusUrlVersionForSandbox: 'V2',
        },
      },
    }),
  });
  let attributes;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    attributes = await readNotificationAttributes(credentials, appId);
    if (notificationsMatch(attributes)) break;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  if (!notificationsMatch(attributes ?? {})) {
    throw new Error('App Store Server Notifications V2 did not persist the frozen production settings.');
  }
  console.log(JSON.stringify(notificationSummary(attributes)));
}

const source = await readFile(fieldsPath, 'utf8');
const contract = productContract(source);
const credentials = await appStoreConnectCredentials();
const { appId } = await appStoreConnectAppContext(credentials, root);

if (command === 'status') await status(credentials, appId, contract);
else if (command === 'sync-products') await syncProducts(credentials, appId, contract);
else if (command === 'sync-commercial') await syncCommercial(credentials, appId, contract);
else if (command === 'commercial-status') await commercialStatus(credentials, appId, contract);
else if (command === 'notification-status') await notificationStatus(credentials, appId);
else if (command === 'sync-notifications') await syncNotifications(credentials, appId);
else throw new Error('Usage: node tools/app-store-connect-iap.mjs <status|sync-products|sync-commercial|commercial-status|notification-status|sync-notifications>');
