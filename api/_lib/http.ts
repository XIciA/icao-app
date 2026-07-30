import { randomUUID } from 'node:crypto';

export type ApiEnvelope<T> = {
  requestId: string;
  data: T;
};

export function requestId() {
  return randomUUID();
}

export function json<T>(data: T, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('cache-control', 'private, no-store');
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function success<T>(id: string, data: T, init: ResponseInit = {}) {
  return json<ApiEnvelope<T>>({ requestId: id, data }, init);
}

export function failure(id: string, status: number, code: string) {
  return json({ requestId: id, error: { code, message: code, status } }, { status });
}

export async function readJson(request: Request, maximumBytes = 16_384) {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > maximumBytes) throw new Error('request_too_large');
  const text = await request.text();
  if (Buffer.byteLength(text) > maximumBytes) throw new Error('request_too_large');
  return JSON.parse(text) as unknown;
}
