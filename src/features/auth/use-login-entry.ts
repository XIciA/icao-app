import { usePathname, type Href } from 'expo-router';
import { useAppRouter } from '@/components/navigation/useAppRouter';
import { useAuth } from './AuthProvider';
import { publicLoginReturn, safeAppDestination } from './guest-access';
import { publicAccountStatus } from './public-account-status';

/** Intercept a deliberate action before mounting its protected screen. */
export function useLoginEntry() {
  const auth = useAuth();
  const router = useAppRouter();
  const pathname = usePathname();
  return (destination: string, _reason?: string) => {
    const target = safeAppDestination(destination) ?? '/(tabs)';
    if (auth.canAccessApp) { router.push(target as Href); return; }
    auth.rememberPendingPath(target);
    // Let the existing protected-route account gate handle restoration or
    // consent. Opening a fresh login form would misrepresent a retained session.
    if (publicAccountStatus(auth) !== 'guest') { router.push(target as Href); return; }
    router.push({ pathname: '/auth/[slug]', params: { slug: 'login', next: target, returnTo: publicLoginReturn(pathname) } });
  };
}
