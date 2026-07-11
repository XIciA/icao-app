import { useLocalSearchParams } from 'expo-router';
import { SplashScreen } from '@/components/auth/splash-screen';
import { LoginScreen } from '@/components/auth/login-screen';
import { RegisterScreen } from '@/components/auth/register-screen';
import { PhoneCodeScreen } from '@/components/auth/phone-code-screen';
import { ForgotPasswordScreen } from '@/components/auth/forgot-password-screen';

type AuthSlug = 'splash' | 'login' | 'register' | 'phone-code' | 'forgot-password';

export default function AuthRoute() {
  const { slug } = useLocalSearchParams<{ slug: AuthSlug }>();
  const page: AuthSlug = ['splash', 'login', 'register', 'phone-code', 'forgot-password'].includes(slug as AuthSlug) ? (slug as AuthSlug) : 'login';

  if (page === 'splash') return <SplashScreen />;
  if (page === 'login') return <LoginScreen />;
  if (page === 'register') return <RegisterScreen />;
  if (page === 'phone-code') return <PhoneCodeScreen />;
  return <ForgotPasswordScreen />;
}
