import { getCommerceEntitlementSnapshot } from '@/features/native-commercial-testflight/commerce-entitlement-events';
import type { RadioTrack } from './types';

export function hasRadioMembership() {
  const membership = getCommerceEntitlementSnapshot()?.snapshot?.membership;
  return membership?.active === true && (!membership.expiresAt || Date.parse(membership.expiresAt) > Date.now());
}
export function canPlayRadioTrack(track: RadioTrack) {
  return !track.requiresMembership || hasRadioMembership();
}

/** Expiry/account changes must not render the previous member's transcript for a frame. */
export function visibleRadioCatalogs(catalogs: import('./types').RadioCatalog[], memberAccess = hasRadioMembership()) {
  if (memberAccess) return catalogs;
  return catalogs.map(catalog => ({ ...catalog, tracks: catalog.tracks.map(track => track.requiresMembership
    ? { ...track, audioText: '', audioTextZh: undefined, referenceText: undefined, referenceTextZh: undefined,
      materials: undefined, audioPath: '', contentLoaded: false }
    : track) }));
}
