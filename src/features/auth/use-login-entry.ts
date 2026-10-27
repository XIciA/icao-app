import { useURL } from 'expo-linking';
import { usePathname, type Href } from 'expo-router';
import { useAppRouter } from '@/components/navigation/useAppRouter';
import { useAuth } from './AuthProvider';
import { isExternalContentEntry, publicLoginReturn, safeAppDestination } from './guest-access';

/** Intercept a deliberate action before mounting its protected screen. */
export function useLoginEntry() {
  const auth = useAuth();
  const router = useAppRouter();
  const pathname = usePathname();
  const incomingUrl = useURL();
  return (destination: string, _reason?: string, options: { replace?: boolean } = {}) => {
    const navigate = options.replace ? router.replace : router.push;
    const target = safeAppDestination(destination) ?? '/(tabs)';
    if (auth.canAccessApp) { navigate(target as Href); return; }
    auth.rememberPendingPath(target);
    // The auth route already renders account restoration/confirmation before its form.
    // Keep the original feature explicit instead of sending a guest through membership.
    navigate({ pathname: '/auth/[slug]', params: { slug: 'login', next: target, ...(target.split('?')[0] === '/account/membership' ? { intent: 'membership' } : isExternalContentEntry(incomingUrl, pathname, target) ? { intent: 'external' } : !['/', '/(tabs)', '/(tabs)/profile', '/profile'].includes(target) ? { intent: 'feature' } : {}), returnTo: publicLoginReturn(pathname) } });
  };
}
