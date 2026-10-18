/** Expo iOS rejects a dismissed print sheet even when no printing error occurred. */
export function isPrintDismissal(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error
    && (error.code === 'ERR_PRINT_INCOMPLETE' || error.code === 'ERR_PICKER_CANCELED');
}
