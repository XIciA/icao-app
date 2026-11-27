import { dataStorageName } from '@/config/data-environment';
import * as SecureStore from 'expo-secure-store';

const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export const phoneOtpStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(dataStorageName(key), options),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(dataStorageName(key), value, options),
  removeItem: (key: string) => SecureStore.deleteItemAsync(dataStorageName(key), options),
};
