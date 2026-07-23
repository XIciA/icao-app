import { useLocalSearchParams } from 'expo-router';
import { SplashScreen } from '@/components/auth/splash-screen';
import { LoginScreen } from '@/components/auth/login-screen';

type AuthSlug = 'splash' | 'login';

export default function AuthRoute() {
  const { slug } = useLocalSearchParams<{ slug: AuthSlug }>();
  const page: AuthSlug = ['splash', 'login'].includes(slug as AuthSlug) ? (slug as AuthSlug) : 'login';

  if (page === 'splash') return <SplashScreen />;
  return page === 'login' ? <LoginScreen /> : <SplashScreen />;
}
