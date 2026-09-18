import { Redirect, useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { AppDownloadScreen } from '@/features/content/AppDownloadScreen';
import { useAuth } from '@/features/auth/AuthProvider';

export default function DownloadPage() {
  const router = useRouter();
  const auth = useAuth();
  return Platform.OS === 'web'
    ? <AppDownloadScreen onBack={() => router.replace(auth.canAccessApp ? '/(tabs)/discover' : '/auth/login')} />
    : <Redirect href="/" />;
}
