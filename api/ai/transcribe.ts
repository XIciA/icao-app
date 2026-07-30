import { transcribeUrl } from '../_lib/ai';
import { failure, readJson, requestId, success } from '../_lib/http';
import { requireSession } from '../_lib/session';

function validRecordingDataUrl(value: unknown): value is string {
  return typeof value === 'string'
    && /^data:audio\/(?:webm|mp4|m4a|x-m4a|wav|mpeg|ogg|opus);base64,[A-Za-z0-9+/]+=*$/u.test(value)
    && value.length <= 4_100_000;
}

export default {
  async fetch(request: Request) {
    const id = requestId();
    try {
      requireSession(request);
      if (request.method !== 'POST') return failure(id, 405, 'method_not_allowed');
      const body = await readJson(request, 4_200_000) as { dataUrl?: unknown };
      if (!validRecordingDataUrl(body.dataUrl)) return failure(id, 400, 'invalid_audio');
      return success(id, await transcribeUrl(
        body.dataUrl,
        request.headers.get('x-vercel-oidc-token') ?? undefined,
      ));
    } catch (error) {
      const code = error instanceof Error ? error.message : 'ai_service_unavailable';
      const status = code === 'web_session_required' ? 401 : code === 'no_speech_detected' ? 422 : 503;
      return failure(id, status, code);
    }
  },
};
