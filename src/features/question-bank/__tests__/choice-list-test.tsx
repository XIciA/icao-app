import { render } from '@testing-library/react-native';

import { ChoiceList } from '../components/ChoiceList';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return { Check: Icon, X: Icon };
});

describe('<ChoiceList />', () => {
  it('reveals the correct answer even before the learner selects an option', async () => {
    const screen = await render(
      <ChoiceList choices={['A', 'B', 'C']} correctChoiceIndex={1} onSelect={jest.fn()} showResult />,
    );

    expect(screen.getByLabelText('正确答案')).toBeTruthy();
  });
});
