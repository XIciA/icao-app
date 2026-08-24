import { isFormalAppSurface, type WebRuntime, WEB_RUNTIME } from '@/config/web-runtime';

export type LoginAgeCopy = Readonly<{
  consentLabel: string;
  consentError: string;
}>;

const FORMAL_APP_LOGIN_AGE_COPY: LoginAgeCopy = Object.freeze({
  consentLabel: '我已年满16周岁，并同意用户协议与隐私政策',
  consentError: '请确认已满16周岁，并同意用户协议与隐私政策。',
});

const VERCEL_LEGACY_LOGIN_AGE_COPY: LoginAgeCopy = Object.freeze({
  consentLabel: '我已年满14周岁，并同意用户协议与隐私政策',
  consentError: '请确认已满14周岁，并同意用户协议与隐私政策。',
});

export function resolveLoginAgeCopy(
  platform: string,
  runtime: WebRuntime = WEB_RUNTIME,
): LoginAgeCopy {
  return isFormalAppSurface(platform, runtime)
    ? FORMAL_APP_LOGIN_AGE_COPY
    : VERCEL_LEGACY_LOGIN_AGE_COPY;
}
