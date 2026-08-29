import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHINA_MAINLAND_TERRITORY_ID,
  createChinaMainlandAvailabilityBody,
  matchesChinaMainlandAvailability,
} from './lib/app-store-connect-iap-availability.mjs';

test('creates an IAP availability restricted to China mainland', () => {
  const body = createChinaMainlandAvailabilityBody('iap-record-id');

  assert.equal(body.data.attributes.availableInNewTerritories, false);
  assert.deepEqual(body.data.relationships.availableTerritories.data, [
    { type: 'territories', id: CHINA_MAINLAND_TERRITORY_ID },
  ]);
});

test('accepts only an exact China mainland availability', () => {
  const availability = {
    data: { attributes: { availableInNewTerritories: false } },
  };

  assert.equal(
    matchesChinaMainlandAvailability(availability, [{ id: CHINA_MAINLAND_TERRITORY_ID }]),
    true,
  );
  assert.equal(
    matchesChinaMainlandAvailability(availability, [
      { id: CHINA_MAINLAND_TERRITORY_ID },
      { id: 'USA' },
    ]),
    false,
  );
  assert.equal(
    matchesChinaMainlandAvailability(
      { data: { attributes: { availableInNewTerritories: true } } },
      [{ id: CHINA_MAINLAND_TERRITORY_ID }],
    ),
    false,
  );
});
