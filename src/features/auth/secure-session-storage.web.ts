import Storage from '@/platform/storage';

// Browser sessions use the same serialized IndexedDB boundary as the web app.
// Device Keychain/SecureStore APIs must never be invoked in a browser.
export const secureSessionStorage = {
  getItem: (key: string) => Storage.getItem(`icao.auth.browser.${key}`),
  setItem: (key: string, value: string) => Storage.setItem(`icao.auth.browser.${key}`, value),
  removeItem: (key: string) => Storage.removeItem(`icao.auth.browser.${key}`),
};
