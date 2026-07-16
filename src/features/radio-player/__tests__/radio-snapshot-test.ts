import { migrateRadioIntervalSeconds } from '../radio-snapshot';

describe('radio snapshot interval migration', () => {
  it('keeps old snapshots compatible with the original zero-second behavior', () => {
    expect(migrateRadioIntervalSeconds({ schemaVersion: 1, rate: 1 })).toBe(0);
  });

  it('restores and normalizes the interval added by schema version 2', () => {
    expect(migrateRadioIntervalSeconds({ schemaVersion: 2, intervalSeconds: 5 })).toBe(5);
    expect(migrateRadioIntervalSeconds({ schemaVersion: 2, intervalSeconds: 99 })).toBe(30);
    expect(migrateRadioIntervalSeconds({ schemaVersion: 2, intervalSeconds: '5' })).toBe(0);
  });
});
