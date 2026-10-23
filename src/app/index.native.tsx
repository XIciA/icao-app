import { Platform } from 'react-native';
import { isFormalAppSurface } from '@/config/web-runtime';
import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth/AuthProvider';

export default function IndexRoute() {
  const auth = useAuth();
  return <Redirect href={isFormalAppSurface(Platform.OS) || auth.canAccessApp ? '/(tabs)' : '/auth/login'} />;
}
