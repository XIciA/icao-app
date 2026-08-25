export function assertActiveOpsAdminCount(value) {
  const numericValue = typeof value === 'number'
    || (typeof value === 'string' && /^[0-9]+$/u.test(value));
  const count = numericValue ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('invalid_active_ops_admin_count');
  }
  if (count < 1) throw new Error('active_ops_admin_required');
  return count;
}
