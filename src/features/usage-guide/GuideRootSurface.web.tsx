import { useContext, type ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import { AppModalHostContext } from '@/components/platform/modal-host-context';
import { GuideOverlay } from './GuideOverlay';
export function GuideRootSurface(props: ComponentProps<typeof GuideOverlay>) {
  const host = useContext(AppModalHostContext);
  return host ? createPortal(<GuideOverlay {...props} />, host) : null;
}
