import { grammarReview } from '../_lib/ai';
import { failure, readJson, requestId, success } from '../_lib/http';
import { requireSession } from '../_lib/session';

export default {
  async fetch(request: Request) {
    const id = requestId();
    try {
      requireSession(request);
      if (request.method !== 'POST') return failure(id, 405, 'method_not_allowed');
      return success(id, await grammarReview(await readJson(request)));
    } catch (error) {
      const code = error instanceof Error ? error.message : 'ai_service_unavailable';
      const status = code === 'web_session_required' ? 401 : code.startsWith('invalid_') ? 400 : 503;
      return failure(id, status, code);
    }
  },
};
