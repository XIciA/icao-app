import { useContext, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ModalProps } from 'react-native';

import { AppModalHostContext } from './modal-host-context';

type AppModalProps = Omit<ModalProps, 'onDismiss' | 'onRequestClose' | 'onShow'> & {
  children?: ReactNode;
  onDismiss?: () => void;
  onRequestClose?: () => void;
  onShow?: () => void;
};

export function AppModal({ children, onDismiss, onRequestClose, onShow, visible = true }: AppModalProps) {
  const host = useContext(AppModalHostContext);

  useEffect(() => {
    if (!visible) return;
    onShow?.();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onRequestClose?.();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      onDismiss?.();
    };
  }, [onDismiss, onRequestClose, onShow, visible]);

  if (!visible || !host) return null;
  return createPortal(children, host);
}
