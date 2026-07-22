import { resolveUiAcceptanceAvailability } from '../ui-acceptance-mode';

describe('UI acceptance mode boundary', () => {
  it('is available only for an explicitly enabled Web build', () => {
    expect(resolveUiAcceptanceAvailability('web', '1')).toBe(true);
    expect(resolveUiAcceptanceAvailability('web', '0')).toBe(false);
    expect(resolveUiAcceptanceAvailability('web', undefined)).toBe(false);
  });

  it('cannot be enabled in native builds', () => {
    expect(resolveUiAcceptanceAvailability('ios', '1')).toBe(false);
    expect(resolveUiAcceptanceAvailability('android', '1')).toBe(false);
  });
});
