import type { TencentAsrModel } from '@icao/contracts';

export async function createAudioUploadForm(uri: string, model: TencentAsrModel) {
  const [{ File }, { fetch: expoFetch }] = await Promise.all([import('expo-file-system'), import('expo/fetch')]);
  const form = new FormData();
  form.append('model', model);
  form.append('audio', new File(uri));
  return { fetch: expoFetch as typeof fetch, form };
}
