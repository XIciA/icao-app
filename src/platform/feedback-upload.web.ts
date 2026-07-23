import type { ImagePickerAsset } from 'expo-image-picker';

export async function createFeedbackUploadForm(payload: string, images: ImagePickerAsset[]) {
  const form = new FormData();
  form.append('payload', payload);
  for (const image of images) {
    let file = image.file;
    if (!file) {
      const response = await fetch(image.uri);
      if (!response.ok) throw new Error('feedback_image_missing');
      const blob = await response.blob();
      file = new File([blob], image.fileName ?? `feedback.${mimeExtension(blob.type)}`, { type: blob.type });
    }
    form.append('images', file, file.name);
  }
  return { fetch, form };
}

function mimeExtension(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}
