import { ArgumentsHost, Catch, HttpException, HttpStatus, type ExceptionFilter } from '@nestjs/common';
import type { ApiErrorEnvelope } from '@icao/contracts';

import type { AuthenticatedRequest } from './auth/auth.types';

type Reply = {
  status(code: number): Reply;
  send(body: ApiErrorEnvelope): void;
};

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<AuthenticatedRequest>();
    const reply = context.getResponse<Reply>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const response = exception instanceof HttpException ? exception.getResponse() : undefined;
    const rawMessage = typeof response === 'string'
      ? response
      : response && typeof response === 'object' && 'message' in response
        ? (response as { message?: string | string[] }).message
        : undefined;
    const message = Array.isArray(rawMessage) ? rawMessage.join(', ') : rawMessage;
    const code = typeof message === 'string' && /^[a-z0-9_]+$/.test(message)
      ? message
      : status === HttpStatus.INTERNAL_SERVER_ERROR ? 'internal_error' : 'request_failed';

    reply.status(status).send({
      requestId: request.id,
      error: { code, message: code, status },
    });
  }
}
