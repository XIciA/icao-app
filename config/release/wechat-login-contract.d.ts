export type WechatLoginCredentials = Readonly<{
  appId: string;
  universalLink: string;
}>;

export type WechatLoginReleaseCapability = WechatLoginCredentials & Readonly<{
  enabled: boolean;
  mode: 'approved' | 'pending';
}>;

export function normalizeWechatLoginCredentials(configuration?: Readonly<{
  appId?: unknown;
  universalLink?: unknown;
}>): WechatLoginCredentials;

export function resolveWechatLoginReleaseCapability(configuration?: Readonly<{
  appId?: unknown;
  schemaVersion?: unknown;
  status?: unknown;
  universalLink?: unknown;
}>): WechatLoginReleaseCapability;
