import { useState } from 'react';
import { Modal, Platform, StyleSheet, View, type ModalProps } from 'react-native';
import { useLastVisibleValue } from './useLastVisibleValue';
import { GuideModalScope, useGuide } from '@/features/usage-guide/GuideBindings';
export function AppModal({ children, visible = true, onShow, onDismiss, animationType, ...props }: ModalProps) {
  const content = useLastVisibleValue(visible, children);
  const guide = useGuide();
  const [presented, setPresented] = useState(false);
  // Native presentation animation would fade the teaching backdrop with the sheet.
  // The sheet keeps its own motion; teaching changes surfaces at native dismissal.
  const teaching = !!guide?.current;
  return <Modal {...props} animationType={teaching ? 'none' : animationType} visible={visible} onShow={event => { setPresented(true); onShow?.(event); }} onDismiss={() => { setPresented(false); onDismiss?.(); }}><GuideModalScope visible={visible || (Platform.OS === 'ios' && presented)}><View pointerEvents={visible ? 'auto' : 'none'} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'} style={styles.content}>{content}</View></GuideModalScope></Modal>;
}

const styles = StyleSheet.create({ content: { flex: 1 } });
