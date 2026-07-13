import { isValidPassword } from '../auth-service';

describe('auth rules', () => {
  it('requires an 8-64 character password containing letters and digits', () => {
    expect(isValidPassword('Password1')).toBe(true);
    expect(isValidPassword('12345678')).toBe(false);
    expect(isValidPassword('abcdefgh')).toBe(false);
    expect(isValidPassword('Pass1')).toBe(false);
    expect(isValidPassword(`${'a'.repeat(64)}1`)).toBe(false);
  });
});
