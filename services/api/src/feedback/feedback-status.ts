/** Preserve the database values used since migration 0007. */
export function feedbackStatusForClient(status: string): string {
  if (status === 'in_progress') return 'processing';
  if (status === 'cannot_reproduce') return 'resolved';
  return status;
}

export function feedbackStatusForStorage(status: string): string {
  return status === 'processing' ? 'in_progress' : status;
}

export function feedbackStatusStorageFilter(status: string): string[] {
  return status === 'resolved' ? ['resolved', 'cannot_reproduce'] : [feedbackStatusForStorage(status)];
}
