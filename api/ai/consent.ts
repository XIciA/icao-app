import { failure, readJson, requestId, success } from '../_lib/http';
import { requireSession } from '../_lib/session';

export default {
  async fetch(request: Request) {
    const id = requestId();
    try {
      requireSession(request);
      if (request.method === 'DELETE') return success(id, { revoked: true });
      if (request.method !== 'POST') return failure(id, 405, 'method_not_allowed');
      const body = await readJson(request) as { accepted?: unknown; policyVersion?: unknown };
      if (body.accepted !== true || typeof body.policyVersion !== 'string') {
        return failure(id, 400, 'invalid_ai_consent');
      }
      return success(id, { policyVersion: body.policyVersion, acceptedAt: new Date().toISOString() });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'ai_service_unavailable';
      return failure(id, code === 'web_session_required' ? 401 : 503, code);
    }
  },
};
