import { ProfileHomeScreen } from '@/features/profile/ProfileHomeScreen';

import { Platform } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { isFormalAppSurface } from '@/config/web-runtime';
import { GuestProfileScreen } from '@/features/auth/GuestProfileScreen';

export default function ProfileTab() {
  const auth = useAuth();
  return isFormalAppSurface(Platform.OS) && !auth.canAccessApp ? <GuestProfileScreen /> : <ProfileHomeScreen />;
}
