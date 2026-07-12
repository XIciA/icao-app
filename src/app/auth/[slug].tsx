import { useLocalSearchParams } from 'expo-router';
import { SplashScreen } from '@/components/auth/splash-screen';
import { LoginScreen } from '@/components/auth/login-screen';
import { RegisterScreen } from '@/components/auth/register-screen';

type AuthSlug = 'splash' | 'login' | 'register';

export default function AuthRoute() {
  const { slug } = useLocalSearchParams<{ slug: AuthSlug }>();
  const page: AuthSlug = ['splash', 'login', 'register'].includes(slug as AuthSlug) ? (slug as AuthSlug) : 'login';

  if (page === 'splash') return <SplashScreen />;
  if (page === 'login') return <LoginScreen />;
  return <RegisterScreen />;
}
