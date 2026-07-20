export async function createAudioUploadForm(uri: string) {
  const [{ File }, { fetch: expoFetch }] = await Promise.all([import('expo-file-system'), import('expo/fetch')]);
  const form = new FormData();
  form.append('audio', new File(uri));
  return { fetch: expoFetch as typeof fetch, form };
}
