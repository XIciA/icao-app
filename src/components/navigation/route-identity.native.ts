/** Shared dynamic screen names still need distinct identities for POP_TO. */
export function accountRouteIdentity(_name: string, params: Record<string, unknown>) {
  return String(params.slug ?? 'settings');
}

export function infoRouteIdentity(_name: string, params: Record<string, unknown>) {
  const slug = String(params.slug ?? 'help');
  if (slug !== 'feedback') return slug;
  if (params.compose === '1' || params.source === 'study' || params.feature) {
    return JSON.stringify([slug, 'compose', params.sourceRoute ?? '', params.cardId ?? '']);
  }
  return JSON.stringify([slug, params.ticket ? 'detail' : 'history', params.ticket ?? '']);
}
