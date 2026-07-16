import { fireEvent, render } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { AudioTimeline } from '../components/AudioTimeline';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

describe('AudioTimeline', () => {
  it('tracks a horizontal drag and commits one final seek', async () => {
    const onScrubStart = jest.fn();
    const onScrubEnd = jest.fn();
    const onInteractionChange = jest.fn();
    const screen = await render(
      <AudioTimeline duration={20} onInteractionChange={onInteractionChange} onScrubEnd={onScrubEnd} onScrubStart={onScrubStart} position={2} testID="test-timeline" />,
    );
    fireEvent(screen.getByTestId('test-timeline'), 'layout', { nativeEvent: { layout: { height: 44, width: 200, x: 0, y: 0 } } });

    fireGestureHandler(getByGestureTestId('test-timeline-pan'), [
      { state: State.BEGAN, x: 20, y: 0 },
      { state: State.ACTIVE, x: 120, y: 1 },
      { state: State.END, x: 160, y: 1 },
    ]);

    expect(onScrubStart).toHaveBeenCalledTimes(1);
    expect(onInteractionChange).toHaveBeenNthCalledWith(1, true);
    expect(onInteractionChange).toHaveBeenLastCalledWith(false);
    expect(onScrubEnd).toHaveBeenCalledTimes(1);
    expect(onScrubEnd).toHaveBeenCalledWith(16);
  });

  it('cancels a failed drag without committing a seek', async () => {
    const onScrubCancel = jest.fn();
    const onScrubEnd = jest.fn();
    const screen = await render(
      <AudioTimeline duration={20} onScrubCancel={onScrubCancel} onScrubEnd={onScrubEnd} position={4} testID="cancel-timeline" />,
    );
    fireEvent(screen.getByTestId('cancel-timeline'), 'layout', { nativeEvent: { layout: { height: 44, width: 200, x: 0, y: 0 } } });

    fireGestureHandler(getByGestureTestId('cancel-timeline-pan'), [
      { state: State.BEGAN, x: 40, y: 0 },
      { state: State.ACTIVE, x: 100, y: 1 },
      { state: State.CANCELLED, x: 100, y: 1 },
    ]);

    expect(onScrubCancel).toHaveBeenCalledTimes(1);
    expect(onScrubEnd).not.toHaveBeenCalled();
  });

  it('supports one-second adjustable accessibility steps for short audio', async () => {
    const onScrubEnd = jest.fn();
    const screen = await render(<AudioTimeline duration={20} onScrubEnd={onScrubEnd} position={2} />);

    fireEvent(screen.getByLabelText('播放进度'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });

    expect(onScrubEnd).toHaveBeenCalledWith(3);
  });

  it('supports an explicit integer step and custom interval formatting without changing progress defaults', async () => {
    const onScrubEnd = jest.fn();
    const screen = await render(<AudioTimeline accessibilityLabel="播放间隔秒数" duration={30} formatValue={(value) => `${Math.round(value)}秒`} onScrubEnd={onScrubEnd} position={5} showLabels={false} step={1} />);

    fireEvent(screen.getByLabelText('播放间隔秒数'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });

    expect(screen.getByLabelText('播放间隔秒数').props.accessibilityValue.text).toBe('5秒 / 30秒');
    expect(onScrubEnd).toHaveBeenCalledWith(6);
  });
});
