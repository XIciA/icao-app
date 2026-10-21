import { requireOptionalNativeModule } from 'expo-modules-core';

type Installer = {
  installApk(uri: string, version: string, build: number, sha256: string): Promise<'installer-opened' | 'permission-required'>;
};

export async function installApk(uri: string, version: string, build: number, sha256: string) {
  const installer = requireOptionalNativeModule<Installer>('IcaoAppInstaller');
  if (!installer) throw new Error('app_installer_unavailable');
  return installer.installApk(uri, version, build, sha256);
}
