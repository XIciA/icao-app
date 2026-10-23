import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AppModal } from '../AppModal.browser';
import { AppModalHostContext } from '../modal-host-context';
import { GuideBindingContext, type GuideBinding } from '@/features/usage-guide/GuideBindings';

jest.mock('react-dom', () => ({ createPortal: (children: React.ReactNode) => children }));

it('moves web teaching into the modal layer and releases it when dismissed', async () => {
  const previous = globalThis.document;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { addEventListener: jest.fn(), removeEventListener: jest.fn() } });
  const modal = jest.fn(), surface = jest.fn(() => <Text>弹层教学</Text>);
  const guide = { modal, surface } as unknown as GuideBinding;
  const host = {} as HTMLElement;
  const tree = (visible: boolean) => <GuideBindingContext.Provider value={guide}><AppModalHostContext.Provider value={host}><AppModal visible={visible}><Text>真实弹层控件</Text></AppModal></AppModalHostContext.Provider></GuideBindingContext.Provider>;
  try {
    const screen = await render(tree(true));
    expect(screen.getByText('真实弹层控件')).toBeTruthy();
    expect(screen.getByText('弹层教学')).toBeTruthy();
    const id = modal.mock.calls.find(([, open]) => open)?.[0];
    expect(id).toEqual(expect.any(String));
    expect(surface).toHaveBeenCalledWith(id);
    await screen.rerender(tree(false));
    expect(modal).toHaveBeenLastCalledWith(id, false);
    expect(screen.queryByText('弹层教学')).toBeNull();
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: previous });
  }
});
