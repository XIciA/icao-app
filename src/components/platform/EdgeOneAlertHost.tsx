import { useSyncExternalStore } from 'react';
import { Alert, Platform, StyleSheet, View, type AlertButton, type AlertOptions } from 'react-native';
import { isEdgeOneProductionWeb } from '@/config/web-runtime';
import { AppModal } from './AppModal';
import { AppText, Button } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

type PendingAlert = { title: string; message?: string; buttons: AlertButton[]; options?: AlertOptions };
const pending: PendingAlert[] = [];
const listeners = new Set<() => void>();
const publish = () => { for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => pending[0];

// React Native Web's Alert is a no-op. Keep the shared product confirmations
// functional without copying every native screen into a parallel web screen.
if (Platform.OS === 'web' && isEdgeOneProductionWeb()) {
  Alert.alert = (title, message, buttons, options) => {
    pending.push({ title, message, buttons: buttons?.length ? buttons : [{ text: '确定' }], options });
    publish();
  };
}

export function EdgeOneAlertHost() {
  const current = useSyncExternalStore(subscribe, snapshot, () => undefined);
  if (!current || Platform.OS !== 'web' || !isEdgeOneProductionWeb()) return null;
  const choose = (button: AlertButton) => {
    if (pending[0] !== current) return;
    pending.shift(); publish(); button.onPress?.();
  };
  const dismiss = () => {
    const cancel = current.buttons.find(button => button.style === 'cancel');
    if (cancel) choose(cancel);
    else if (current.options?.cancelable) { pending.shift(); publish(); current.options.onDismiss?.(); }
  };
  return <AppModal transparent visible onRequestClose={dismiss}>
    <View style={styles.backdrop} accessibilityViewIsModal>
      <View style={styles.card} accessibilityRole="alert">
        <AppText variant="sectionTitle">{current.title}</AppText>
        {current.message ? <AppText>{current.message}</AppText> : null}
        <View style={styles.actions}>{current.buttons.map((button, index) =>
          <Button key={index} onPress={() => choose(button)} variant={button.style === 'cancel' ? 'secondary' : 'primary'}>{button.text ?? '确定'}</Button>,
        )}</View>
      </View>
    </View>
  </AppModal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)', padding: spacing[5] },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.card, borderRadius: radii.xl, padding: spacing[5], gap: spacing[4] },
  actions: { gap: spacing[2] },
});
