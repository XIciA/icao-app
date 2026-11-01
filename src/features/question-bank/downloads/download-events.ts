// Availability notification only. Package data remains owned by download-manager.
let version = 0;
const listeners = new Set<() => void>();
export const downloadAvailabilityVersion = () => version;
export function subscribeDownloadAvailability(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function publishDownloadAvailability() { version++; listeners.forEach(listener => listener()); }
