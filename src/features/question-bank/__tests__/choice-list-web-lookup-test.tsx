import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ChoiceList } from '../components/ChoiceList';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return { Check: Icon, X: Icon };
});

describe('<ChoiceList /> in web lookup mode', () => {
  it('uses a single tap on an option word without selecting the choice', async () => {
    const onLookupWord = jest.fn();
    const onSelect = jest.fn();
    const screen = await render(
      <ChoiceList choices={['Request deviation now.']} isLookupAvailable={(word) => word === 'deviation'} lookupInteraction="tap" onLookupWord={onLookupWord} onSelect={onSelect} />,
    );

    const lookupTarget = screen.getByLabelText('查词：deviation');
    expect(StyleSheet.flatten(lookupTarget.props.style).cursor).toBe('pointer');
    expect(StyleSheet.flatten(screen.getByText('deviation').props.style).textDecorationLine).toBeUndefined();
    fireEvent.press(lookupTarget);
    expect(onLookupWord).toHaveBeenCalledWith('deviation');
    expect(onSelect).not.toHaveBeenCalled();
  });
});
