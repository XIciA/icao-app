import { clearSessionCookie, currentSession, sessionResponse, signIn } from './_lib/session';
import { failure, readJson, requestId, success } from './_lib/http';

export default {
  async fetch(request: Request) {
    const id = requestId();
    try {
      if (request.method === 'GET') {
        const session = currentSession(request);
        return session ? success(id, sessionResponse(session)) : failure(id, 401, 'web_session_required');
      }
      if (request.method === 'DELETE') {
        return success(id, { signedOut: true }, { headers: { 'set-cookie': clearSessionCookie() } });
      }
      if (request.method !== 'POST') return failure(id, 405, 'method_not_allowed');
      const body = await readJson(request) as { inviteCode?: unknown };
      if (typeof body.inviteCode !== 'string') return failure(id, 400, 'invalid_invite_code');
      const session = signIn(body.inviteCode);
      if (!session) return failure(id, 401, 'invalid_invite_code');
      return success(id, sessionResponse(session.payload), { headers: { 'set-cookie': session.cookie } });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'web_session_unavailable';
      return failure(id, code === 'invalid_invite_code' ? 401 : 503, code);
    }
  },
};
