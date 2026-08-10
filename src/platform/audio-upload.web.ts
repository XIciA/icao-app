export async function createAudioUploadForm(uri: string) {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('recording_asset_missing');
  const blob = await response.blob();
  const extension = blob.type.includes('mp4')
    ? 'm4a'
    : blob.type.includes('ogg')
      ? 'ogg'
      : blob.type.includes('wav')
        ? 'wav'
        : 'webm';
  const form = new FormData();
  form.append('audio', blob, `recording.${extension}`);
  return { fetch, form };
}
