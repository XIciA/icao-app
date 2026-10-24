import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { OptionalAuthGuard, type RequireAuthGuard } from '../src/auth/require-auth.guard';

const context = (authorization?: string) => ({ switchToHttp: () => ({ getRequest: () => ({ headers: authorization === undefined ? {} : { authorization } }) }) }) as ExecutionContext;
describe('anonymous content authentication', () => {
  it('allows a genuinely anonymous public request without manufacturing an identity', () => {
    const canActivate = vi.fn();
    expect(new OptionalAuthGuard({ canActivate } as unknown as RequireAuthGuard).canActivate(context())).toBe(true);
    expect(canActivate).not.toHaveBeenCalled();
  });
  it.each(['', 'Basic test', 'Bearer expired'])('validates a supplied credential instead of downgrading it to guest: %s', authorization => {
    const canActivate = vi.fn(() => { throw new Error('invalid_bearer_token'); });
    expect(() => new OptionalAuthGuard({ canActivate } as unknown as RequireAuthGuard).canActivate(context(authorization))).toThrow('invalid_bearer_token');
  });
});
