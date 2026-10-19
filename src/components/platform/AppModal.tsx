import { Modal, type ModalProps } from 'react-native';
import { GuideModalScope } from '@/features/usage-guide/GuideBindings';
export function AppModal({ children, visible = true, ...props }: ModalProps) {
  return <Modal {...props} visible={visible}><GuideModalScope visible={visible}>{children}</GuideModalScope></Modal>;
}
