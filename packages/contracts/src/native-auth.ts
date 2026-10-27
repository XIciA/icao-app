import type {
  AccountDataExportResponse,
  AccountSummary,
  AuthenticatedUser,
  AuthIdentityProvider,
  OpsUserSummary,
  RecentAuthGrantResponse,
  RecentAuthMethod,
  RecentAuthPurpose,
  SocialAuthSessionResponse,
  StartPhoneBindingResponse,
  StartPhoneOtpResponse,
} from './index';

export const PHONE_PASSWORD_MIN_LENGTH = 8;
export const PHONE_PASSWORD_MAX_LENGTH = 32;

/** Shared by Native password creation/reset and the API. Existing credentials remain usable at login. */
export function isValidPhonePassword(password: string) {
  const length = Array.from(password).length;
  return length >= PHONE_PASSWORD_MIN_LENGTH && length <= PHONE_PASSWORD_MAX_LENGTH
    && /[A-Za-z]/u.test(password) && /[0-9]/u.test(password);
}

/** Native 1.0.0 identity providers. Kept outside the Web-owned contract barrel. */
export type NativeAuthIdentityProvider = AuthIdentityProvider | 'wechat';

export type NativeAuthenticatedUser = Omit<AuthenticatedUser, 'providers'> & {
  providers?: NativeAuthIdentityProvider[];
};

export type NativeAccountSummary = Omit<AccountSummary, 'providers'> & {
  /** Stable business-account registration time; absent on older API deployments. */
  createdAt?: string;
  /** Whether the bound phone principal has a usable password credential. */
  hasPassword?: boolean;
  providers: NativeAuthIdentityProvider[];
};

export type NativeBindPhoneResponse = {
  account: NativeAccountSummary;
  session: SocialAuthSessionResponse;
};

export type NativeBindPhoneRequest = {
  challengeId: string;
  phone: string;
  recentAuthGrantId?: string;
  token: string;
};

export type NativeStartPhoneBindingResponse = StartPhoneBindingResponse & {
  challengeId: string;
  expiresAt: number;
  issuedAt: number;
  resendAllowedAt: number;
  serverTime: number;
};

export type NativeStartPhoneOtpResponse = StartPhoneOtpResponse & {
  challengeId: string;
  serverTime: number;
};

export type PhoneOtpPurpose = 'login' | 'recovery';

export type VerifyPhoneOtpRequest = {
  challengeId: string;
  phone: string;
  purpose: PhoneOtpPurpose;
  token: string;
};

export type VerifyPhoneOtpResponse = {
  session: SocialAuthSessionResponse;
  verified: true;
};

export type WechatAuthAvailability = 'available' | 'configuration_pending';

export type StartWechatAuthResponse = {
  appId?: string;
  challengeId: string;
  expiresAt: number;
  issuedAt: number;
  state: string;
  status: WechatAuthAvailability;
};

export type CompleteWechatAuthRequest = {
  challengeId: string;
  code: string;
  state: string;
};

export type CompleteWechatAuthResponse = {
  account: NativeAccountSummary;
  session: SocialAuthSessionResponse;
};

export type NativeRecentAuthMethod = RecentAuthMethod | 'wechat';

export type LoginMethodActionPurpose = 'phone_binding' | 'apple_binding' | 'wechat_binding' | 'apple_unbinding' | 'wechat_unbinding';
export type NativeRecentAuthPurpose = RecentAuthPurpose | LoginMethodActionPurpose;
export type NativeRecentAuthGrantResponse = Omit<RecentAuthGrantResponse, 'method' | 'purpose'> & {
  method: NativeRecentAuthMethod;
  purpose: NativeRecentAuthPurpose;
};
export type LoginMethodChangeResponse = {
  accountId: string;
  providers: NativeAuthIdentityProvider[];
  sessionEnded: boolean;
};
export type BindAppleLoginMethodRequest = { providerAccessToken: string; recentAuthGrantId: string };
export type BindWechatLoginMethodRequest = CompleteWechatAuthRequest & { recentAuthGrantId: string };
export type UnbindLoginMethodRequest = { recentAuthGrantId: string };
export type NativePasswordRecentAuthRequest = { password: string; purpose: 'account_delete' | 'session_revoke_all' | LoginMethodActionPurpose };
export type NativeAppleRecentAuthRequest = { authorizationCode: string; rawNonce: string; providerAccessToken?: string; purpose: 'account_delete' | 'session_revoke_all' | LoginMethodActionPurpose };

export type NativePhoneRecentAuthRequest = {
  challengeId: string;
  purpose: 'account_delete' | 'session_revoke_all' | LoginMethodActionPurpose;
  token: string;
};

export type NativeStartPhoneRecentAuthRequest = Pick<NativePhoneRecentAuthRequest, 'purpose'>;

export type WechatRecentAuthRequest = {
  challengeId: string;
  code: string;
  purpose: 'account_delete' | 'phone_binding' | 'session_revoke_all' | LoginMethodActionPurpose;
  state: string;
};

export type StartWechatRecentAuthRequest = Pick<WechatRecentAuthRequest, 'purpose'>;

export type NativeAccountDataExportResponse = Omit<AccountDataExportResponse, 'account'> & {
  account: Omit<AccountDataExportResponse['account'], 'providers'> & {
    providers: NativeAuthIdentityProvider[];
  };
};

export type NativeOpsUserSummary = Omit<OpsUserSummary, 'providers'> & {
  providers: NativeAuthIdentityProvider[];
};
