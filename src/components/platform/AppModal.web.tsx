import { useContext, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ModalProps } from 'react-native';

import { AppModalHostContext } from './modal-host-context';
import { GuideModalScope } from '@/features/usage-guide/GuideBindings';

type AppModalProps = Omit<ModalProps, 'onDismiss' | 'onRequestClose' | 'onShow'> & {
  children?: ReactNode;
  onDismiss?: () => void;
  onRequestClose?: () => void;
  onShow?: () => void;
};

export function AppModal({ children, onDismiss, onRequestClose, onShow, visible = true }: AppModalProps) {
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
  return createPortal(<GuideModalScope visible={visible}>{children}</GuideModalScope>, host);
}
