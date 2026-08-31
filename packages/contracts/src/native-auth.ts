import type {
  AccountDataExportResponse,
  AccountSummary,
  AuthenticatedUser,
  AuthIdentityProvider,
  OpsUserSummary,
  RecentAuthGrantResponse,
  RecentAuthMethod,
  SocialAuthSessionResponse,
  StartPhoneBindingResponse,
  StartPhoneOtpResponse,
} from './index';

/** Native 1.0.0 identity providers. Kept outside the Web-owned contract barrel. */
export type NativeAuthIdentityProvider = AuthIdentityProvider | 'wechat';

export type NativeAuthenticatedUser = Omit<AuthenticatedUser, 'providers'> & {
  providers?: NativeAuthIdentityProvider[];
};

export type NativeAccountSummary = Omit<AccountSummary, 'providers'> & {
  providers: NativeAuthIdentityProvider[];
};

export type NativeBindPhoneResponse = {
  account: NativeAccountSummary;
  session: SocialAuthSessionResponse;
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

export type NativeRecentAuthGrantResponse = Omit<RecentAuthGrantResponse, 'method'> & {
  method: NativeRecentAuthMethod;
};

export type WechatRecentAuthRequest = {
  challengeId: string;
  code: string;
  purpose: 'account_delete';
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
