import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { AppModal } from '@/components/platform/AppModal';
import { AppText, Button, Card } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { captureLearningWriteContext, assertLearningWriteContext } from '@/features/sync/learning-sync.native';

/** Keep the user's current screen mounted while saving or retrying the same intent. */
export function useSaveAction() {
  const pending = useRef(false);
  const mounted = useRef(true);
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState<(() => void)>();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function run(operation: () => Promise<unknown>, onSaved?: () => void, context = captureLearningWriteContext()) {
    if (pending.current) return;
    pending.current = true;
    setSaving(true); setRetry(undefined);
    try {
      assertLearningWriteContext(context);
      await operation();
      assertLearningWriteContext(context);
      if (mounted.current) onSaved?.();
    } catch {
      if (mounted.current) setRetry(() => () => { void run(operation, onSaved, context); });
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  function panel() {
    if (!retry) return null;
    return <Card style={{ gap: spacing[3], padding: spacing[5] }}>
      <AppText variant="cardTitle">{saving ? '正在保存' : '保存尚未完成'}</AppText>
      <AppText>{saving ? '请稍候，保存完成后继续。' : '本次操作未完整保存。请检查设备可用空间后重试；当前页面仍保留。若已切换账号，请返回重新进入。'}</AppText>
      {!saving ? <><Button onPress={retry}>重试保存</Button><Button variant="outline" onPress={() => setRetry(undefined)}>返回检查</Button></> : null}
    </Card>;
  }
  function wrap(children: ReactNode) {
    return <>{children}<AppModal transparent visible={!!retry} animationType="fade" onRequestClose={() => { if (!saving) setRetry(undefined); }}>
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing[5], backgroundColor: colors.overlay }}>{panel()}</View>
    </AppModal></>;
  }
  return { run, wrap, panel, saving, failed: !!retry, isPending: () => pending.current };
}
