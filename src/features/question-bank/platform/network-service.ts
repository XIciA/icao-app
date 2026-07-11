import * as Network from 'expo-network';

export type Connectivity = 'online' | 'offline' | 'unknown';

export async function getConnectivity(): Promise<Connectivity> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (state.isConnected === false || state.isInternetReachable === false) return 'offline';
    if (state.isConnected === true) return 'online';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
