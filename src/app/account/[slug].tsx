import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { GuestMembershipPage } from '@/features/native-commercial-testflight/GuestMembershipPage';
import { AccountScreen } from '@/features/account/AccountScreen';

export default function AccountRoute() { const { slug } = useLocalSearchParams<{ slug?: string }>();
  const auth = useAuth();
  if (slug === 'membership' && !auth.canAccessApp) return <GuestMembershipPage />;
  return <AccountScreen />; }
