export const includeNativeProtectedRoutes = false;

export function appErrorBoundaryDescription(error: Error) {
  return __DEV__ ? error.message : '页面遇到异常，请稍后重新加载。';
}
