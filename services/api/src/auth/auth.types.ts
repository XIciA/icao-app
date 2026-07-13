import type { AuthenticatedUser } from '@icao/contracts';

export const AUTH_VERIFIER = Symbol('AUTH_VERIFIER');

export type AuthVerifier = {
  verify(token: string): Promise<VerifiedAuthSession>;
};

export type VerifiedAuthSession = {
  accessToken: string;
  issuedAt: number;
  sessionId: string;
  user: AuthenticatedUser;
};

export type AuthenticatedRequest = {
  id: string;
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
  auth?: VerifiedAuthSession;
};
