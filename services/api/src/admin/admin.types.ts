import type { OpsStaffRole } from '@icao/contracts';

export type OpsAuthenticatedStaff = {
  email: string;
  id: string;
  role: OpsStaffRole;
  sessionId: string;
};

export type OpsAuthenticatedRequest = {
  id: string;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  raw?: { socket: { remoteAddress?: string } };
  opsStaff?: OpsAuthenticatedStaff;
};
