import { fireEvent, render } from '@testing-library/react-native';

import { ChoiceList } from '../components/ChoiceList';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return { Check: Icon, X: Icon };
});

describe('<ChoiceList /> in native lookup mode', () => {
  it('uses a long press on an option word', async () => {
    const onLookupWord = jest.fn();
    const onSelect = jest.fn();
    const screen = await render(
      <ChoiceList choices={['Request deviation now.']} isLookupAvailable={(word) => word === 'deviation'} onLookupWord={onLookupWord} onSelect={onSelect} />,
    );

    fireEvent(screen.getByLabelText('长按查词：deviation'), 'longPress');
    expect(onLookupWord).toHaveBeenCalledWith('deviation');
    expect(onSelect).not.toHaveBeenCalled();
  });
});
