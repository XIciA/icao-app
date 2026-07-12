import type { AuthenticatedUser } from '@icao/contracts';

export const AUTH_VERIFIER = Symbol('AUTH_VERIFIER');

export type AuthVerifier = {
  verify(token: string): Promise<AuthenticatedUser>;
};

export type AuthenticatedRequest = {
  id: string;
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
};
