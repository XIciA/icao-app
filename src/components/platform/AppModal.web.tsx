import { useContext, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { ModalProps, View } from 'react-native';

import { AppModalHostContext } from './modal-host-context';
import { GuideModalScope } from '@/features/usage-guide/GuideBindings';

type AppModalProps = Omit<ModalProps, 'onDismiss' | 'onRequestClose' | 'onShow'> & {
  children?: ReactNode;
  guideBackdropRef?: RefObject<View | null>;
  onDismiss?: () => void;
  onRequestClose?: () => void;
  onShow?: () => void;
};

export function AppModal({ children, onDismiss, onRequestClose, onShow, visible = true, guideBackdropRef }: AppModalProps) {
  const host = useContext(AppModalHostContext);

  const callbacks = useRef({ onDismiss, onRequestClose, onShow });
  callbacks.current = { onDismiss, onRequestClose, onShow };
  useEffect(() => {
    if (!visible) return;
    callbacks.current.onShow?.();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') callbacks.current.onRequestClose?.();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      callbacks.current.onDismiss?.();
    };
  }, [visible]);

  if (!visible || !host) return null;
  return createPortal(<GuideModalScope visible={visible} backdrop={guideBackdropRef}>{children}</GuideModalScope>, host);
}
