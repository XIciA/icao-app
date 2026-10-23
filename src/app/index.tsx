import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth/AuthProvider';

export default function IndexRoute() {
  const auth = useAuth();
  return <Redirect href={auth.canAccessApp ? '/(tabs)' : '/auth/login'} />;
}
