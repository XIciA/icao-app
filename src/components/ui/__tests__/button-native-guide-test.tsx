import { render } from '@testing-library/react-native';
import { Button } from '../Button.native';
import { GuideBindingContext, type GuideBinding } from '@/features/usage-guide/GuideBindings';

it('registers the actual native action as a guide target, including while loading', async () => {
  const binding={register:jest.fn()} as unknown as GuideBinding;
  const screen=await render(<GuideBindingContext.Provider value={binding}><Button guideId="vocab-start">开始学习</Button></GuideBindingContext.Provider>);
  expect(screen.getByTestId('guide-anchor-vocab-start')).toBeTruthy();
  await screen.rerender(<GuideBindingContext.Provider value={binding}><Button guideId="export-generate" loading>生成 PDF</Button></GuideBindingContext.Provider>);
  expect(screen.getByTestId('guide-anchor-export-generate')).toBeTruthy();
});
it('adds no anchor outside a guide provider and does not forward guideId to the host', async () => {
  const screen=await render(<Button guideId="vocab-start" testID="native-action">开始学习</Button>);
  expect(screen.queryByTestId('guide-anchor-vocab-start')).toBeNull();
  expect(screen.getByTestId('native-action').props.guideId).toBeUndefined();
});
