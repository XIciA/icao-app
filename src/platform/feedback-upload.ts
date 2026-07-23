import type { ImagePickerAsset } from 'expo-image-picker';

export async function createFeedbackUploadForm(payload: string, images: ImagePickerAsset[]) {
  const [{ File }, { fetch: expoFetch }] = await Promise.all([import('expo-file-system'), import('expo/fetch')]);
  const form = new FormData();
  form.append('payload', payload);
  for (const image of images) form.append('images', new File(image.uri));
  return { fetch: expoFetch as typeof fetch, form };
}
