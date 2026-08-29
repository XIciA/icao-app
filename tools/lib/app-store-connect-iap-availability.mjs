export const CHINA_MAINLAND_TERRITORY_ID = 'CHN';

const CHINA_MAINLAND_TERRITORIES = Object.freeze([
  Object.freeze({ type: 'territories', id: CHINA_MAINLAND_TERRITORY_ID }),
]);

export function createChinaMainlandAvailabilityBody(productId) {
  if (typeof productId !== 'string' || productId.length === 0) {
    throw new Error('App Store product ID is required for availability.');
  }
  return {
    data: {
      type: 'inAppPurchaseAvailabilities',
      attributes: { availableInNewTerritories: false },
      relationships: {
        inAppPurchase: { data: { type: 'inAppPurchases', id: productId } },
        availableTerritories: { data: CHINA_MAINLAND_TERRITORIES },
      },
    },
  };
}

export function matchesChinaMainlandAvailability(availability, availableTerritories) {
  return availability?.data?.attributes?.availableInNewTerritories === false
    && Array.isArray(availableTerritories)
    && availableTerritories.length === 1
    && availableTerritories[0]?.id === CHINA_MAINLAND_TERRITORY_ID;
}
