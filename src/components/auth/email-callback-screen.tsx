import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { CenteredState } from '@/components/states/CenteredState';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { useAuth } from '@/features/auth/AuthProvider';

export function EmailCallbackScreen() {
  const router = useRouter();
  const auth = useAuth();
  const params = useLocalSearchParams<{ code?: string; flow?: string }>();
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (typeof params.code !== 'string' || (params.flow !== 'recovery' && params.flow !== 'email-change')) {
      setError('邮件链接缺少必要参数。');
      return;
    }
    let active = true;
    void auth.exchangeEmailCode(params.code).then(async () => {
      if (!active) return;
      if (params.flow === 'recovery') router.replace('/auth/recovery');
      else {
        await auth.signOutAll();
        if (active) router.replace('/auth/login');
      }
    }).catch(() => { if (active) setError('邮件链接无效、已使用或已过期。'); });
    return () => { active = false; };
  }, [auth, params.code, params.flow, router]);

  if (!error) return <GlobalLoadingScreen />;
  return <View style={{ flex: 1 }}><CenteredState actionLabel="返回登录" description={error} onAction={() => { void auth.signOut().finally(() => router.replace('/auth/login')); }} title="无法处理邮件" tone="destructive" /></View>;
}
