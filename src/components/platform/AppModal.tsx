import { Modal, StyleSheet, View, type ModalProps } from 'react-native';
import { useLastVisibleValue } from './useLastVisibleValue';
import { GuideModalScope } from '@/features/usage-guide/GuideBindings';
export function AppModal({ children, visible = true, ...props }: ModalProps) {
  const content = useLastVisibleValue(visible, children);
  return <Modal {...props} visible={visible}><GuideModalScope visible={visible}><View pointerEvents={visible ? 'auto' : 'none'} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'} style={styles.content}>{content}</View></GuideModalScope></Modal>;
}

const styles = StyleSheet.create({ content: { flex: 1 } });
