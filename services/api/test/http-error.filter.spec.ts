import { HttpException, type ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HttpErrorFilter } from '../src/http-error.filter';

describe('HTTP error compatibility', () => {
  it.each([
    [429, 12.2, 13], [429, undefined, undefined], [429, -1, undefined],
    [429, Number.NaN, undefined], [403, 12, undefined],
  ])('only exposes a valid retry deadline for status %s / %s', (status, value, expected) => {
    const send = vi.fn();
    const reply = { status: vi.fn().mockReturnValue({ send }) };
    const host = { switchToHttp: () => ({ getRequest: () => ({ id: 'request' }), getResponse: () => reply }) } as unknown as ArgumentsHost;
    new HttpErrorFilter().catch(new HttpException({ message: 'content_credential_rate_limited', retryAfterSeconds: value }, status!), host);
    expect(reply.status).toHaveBeenCalledWith(status);
    expect(send).toHaveBeenCalledWith({ requestId: 'request', error: {
      code: 'content_credential_rate_limited', message: 'content_credential_rate_limited', status,
      ...(expected === undefined ? {} : { retryAfterSeconds: expected }),
    } });
  });
});
