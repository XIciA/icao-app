export function membershipReminder(expiresAt:string|null|undefined, now=Date.now()) {
  if(!expiresAt)return undefined;
  const expiry=Date.parse(expiresAt);if(!Number.isFinite(expiry)||expiry-now>3*86400000)return undefined;
  return {expiresAt,phase:expiry<=now?'expired' as const:'expiring' as const};
}
