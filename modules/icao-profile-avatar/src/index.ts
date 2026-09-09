import { requireOptionalNativeModule } from 'expo-modules-core';

type NativeProfileAvatar = { prepareAvatar(uri: string): Promise<string> };

/** Only the small JPEG is returned to the existing account profile store. */
export async function prepareProfileAvatar(uri: string): Promise<string> {
  if (!/^(file|content):\/\//i.test(uri)) throw new Error('Avatar must be a local image');
  const native = requireOptionalNativeModule<NativeProfileAvatar>('IcaoProfileAvatar');
  if (!native) throw new Error('Avatar preparation is unavailable');
  const result = await native.prepareAvatar(uri);
  if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(result) || result.length > 180_000) {
    throw new Error('Avatar preparation returned an invalid image');
  }
  return result;
}
