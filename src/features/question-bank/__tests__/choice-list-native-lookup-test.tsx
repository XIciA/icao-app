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

    await fireEvent(screen.getByLabelText('长按查词：deviation'), 'longPress');
    expect(onLookupWord).toHaveBeenCalledWith('deviation');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('selects an answer from a short word tap, but not the release after a lookup', async () => {
    const onLookupWord = jest.fn();
    const onSelect = jest.fn();
    const screen = await render(<ChoiceList choices={['Request deviation now.']} onLookupWord={onLookupWord} onSelect={onSelect} />);
    const word = screen.getByLabelText('长按查词：deviation');
    const stopPropagation = jest.fn();
    await fireEvent(word, 'pressIn');
    await fireEvent.press(word, { stopPropagation });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(0);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    onSelect.mockClear();
    await fireEvent(word, 'pressIn');
    await fireEvent(word, 'longPress');
    await fireEvent.press(word, { stopPropagation });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onLookupWord).toHaveBeenCalledWith('deviation');
  });

  it('allows the next touch even when the platform omits press after a long press', async () => {
    const onSelect = jest.fn();
    const screen = await render(<ChoiceList choices={['Alpha bravo.']} onLookupWord={jest.fn()} onSelect={onSelect} />);
    const word = screen.getByLabelText('长按查词：alpha');
    await fireEvent(word, 'pressIn');
    await fireEvent(word, 'longPress');
    await fireEvent(word, 'pressIn');
    await fireEvent.press(word, { stopPropagation: jest.fn() });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
