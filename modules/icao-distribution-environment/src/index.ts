import { requireOptionalNativeModule } from 'expo-modules-core';

export type IcaoDistributionEnvironment = 'production' | 'sandbox';

type NativeDistributionEnvironmentModule = {
  getEnvironment(): IcaoDistributionEnvironment;
  verifyEd25519Jws(token: string, publicKeyBase64: string): string | null;
};

let nativeModule: NativeDistributionEnvironmentModule | null | undefined;

function getNativeModule() {
  nativeModule ??= requireOptionalNativeModule<NativeDistributionEnvironmentModule>(
    'IcaoDistributionEnvironment',
  );
  return nativeModule;
}

export function getIcaoDistributionEnvironment(): IcaoDistributionEnvironment {
  return getNativeModule()?.getEnvironment() === 'sandbox' ? 'sandbox' : 'production';
}

export function verifyIcaoEd25519Jws(token: string, publicKeyBase64: string): string | undefined {
  return getNativeModule()?.verifyEd25519Jws(token, publicKeyBase64) ?? undefined;
}
