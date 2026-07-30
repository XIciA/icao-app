import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'icao_web_session';
const SESSION_SECONDS = 30 * 24 * 60 * 60;

type InviteMap = Record<string, string>;
type SessionPayload = {
  v: 1;
  id: string;
  displayName: string;
  exp: number;
};

function secret() {
  const value = process.env.WEB_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('web_session_not_configured');
  return value;
}

function invites(): InviteMap {
  const value = process.env.WEB_INVITE_CODES_JSON;
  if (!value) throw new Error('web_invites_not_configured');
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('web_invites_not_configured');
  return parsed as InviteMap;
}

function encode(value: string) {
  return Buffer.from(value).toString('base64url');
}

function decode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signature(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieValue(request: Request, name: string) {
  const header = request.headers.get('cookie') ?? '';
  for (const entry of header.split(';')) {
    const [key, ...parts] = entry.trim().split('=');
    if (key === name) return parts.join('=');
  }
  return undefined;
}

function parseToken(value?: string): SessionPayload | undefined {
  if (!value) return undefined;
  const [encoded, suppliedSignature] = value.split('.', 2);
  if (!encoded || !suppliedSignature || !equal(signature(encoded), suppliedSignature)) return undefined;
  try {
    const payload = JSON.parse(decode(encoded)) as SessionPayload;
    if (payload.v !== 1 || !payload.id || !payload.displayName || payload.exp <= Math.floor(Date.now() / 1000)) {
      return undefined;
    }
    return payload;
  } catch {
    return undefined;
  }
}

export function currentSession(request: Request) {
  return parseToken(cookieValue(request, COOKIE_NAME));
}

export function requireSession(request: Request) {
  const session = currentSession(request);
  if (!session) throw new Error('web_session_required');
  return session;
}

export function signIn(inviteCode: string) {
  const normalized = inviteCode.trim();
  const displayName = invites()[normalized];
  if (!displayName) return undefined;
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload: SessionPayload = {
    v: 1,
    id: createHash('sha256').update(`web:${normalized}`).digest('hex'),
    displayName,
    exp,
  };
  const encoded = encode(JSON.stringify(payload));
  return {
    payload,
    cookie: `${COOKIE_NAME}=${encoded}.${signature(encoded)}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
  };
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export function sessionResponse(payload: SessionPayload) {
  return {
    accessToken: 'web-cookie-session',
    refreshToken: 'web-cookie-session',
    expiresAt: payload.exp,
    user: { id: payload.id, displayName: payload.displayName },
  };
}
