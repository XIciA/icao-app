import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { ImageQuestionCard } from '../components/ImageQuestionCard';
import { useQuestionBankAsset } from '../hooks/useQuestionBankAsset';

const retry = jest.fn();

jest.mock('../hooks/useQuestionBankAsset', () => ({ useQuestionBankAsset: jest.fn() }));
jest.mock('expo-image', () => {
  const { View } = jest.requireActual('react-native');
  return { Image: (props: object) => <View {...props} /> };
});
jest.mock('lucide-react-native', () => {
  const { View: NativeView } = jest.requireActual('react-native');
  const Icon = (props: object) => <NativeView {...props} />;
  return { AlertCircle: Icon, ImageIcon: Icon, RotateCcw: Icon };
});

const mockedAsset = jest.mocked(useQuestionBankAsset);

describe('image question card', () => {
  beforeEach(() => {
    jest.useRealTimers();
    retry.mockClear();
    mockedAsset.mockReturnValue({ uri: 'file:///image.jpg', resolving: false, retry });
  });

  it('shows the full image and marks the card complete only after load', async () => {
    const onDisplayed = jest.fn();
    const screen = await render(<ImageQuestionCard imageAlt="夜航驾驶舱航空场景图片" imagePath="/question-bank-assets/images/opi/image.jpg" onDisplayed={onDisplayed} />);
    const image = screen.getByTestId('image-question-image');

    expect(image.props.contentFit).toBe('contain');
    expect(image.props.cachePolicy).toBe('memory-disk');
    expect(image.props.accessibilityLabel).toBe('夜航驾驶舱航空场景图片');
    expect(onDisplayed).not.toHaveBeenCalled();

    fireEvent(image, 'load');
    expect(onDisplayed).toHaveBeenCalledTimes(1);
  });

  it('shows a recoverable error and refreshes the signed resource on retry', async () => {
    const screen = await render(<ImageQuestionCard imageAlt="航空场景图片" imagePath="/question-bank-assets/images/opi/image.jpg" />);
    await act(async () => { screen.getByTestId('image-question-image').props.onError(); });

    expect(screen.getByText('图片加载失败')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByLabelText('重试图片')); });
    expect(retry).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('正在加载图片…')).toBeTruthy());
  });

  it('recovers when the signed remote URL replaces a failed development URL', async () => {
    const onDisplayed = jest.fn();
    const screen = await render(<ImageQuestionCard imageAlt="航空场景图片" imagePath="/question-bank-assets/images/opi/image.jpg" onDisplayed={onDisplayed} />);
    await act(async () => { screen.getByTestId('image-question-image').props.onError(); });
    expect(screen.getByText('图片加载失败')).toBeTruthy();

    mockedAsset.mockReturnValue({ uri: 'https://storage.example.test/signed-image.jpg', resolving: false, retry });
    await screen.rerender(<ImageQuestionCard imageAlt="航空场景图片" imagePath="/question-bank-assets/images/opi/image.jpg" onDisplayed={onDisplayed} />);

    await waitFor(() => expect(screen.getByTestId('image-question-image').props.source).toBe('https://storage.example.test/signed-image.jpg'));
    fireEvent(screen.getByTestId('image-question-image'), 'load');
    expect(onDisplayed).toHaveBeenCalledTimes(1);
  });

  it('turns a stalled image request into a retryable timeout state', async () => {
    jest.useFakeTimers();
    const screen = await render(<ImageQuestionCard imageAlt="航空场景图片" imagePath="/question-bank-assets/images/opi/image.jpg" />);

    await act(async () => { jest.advanceTimersByTime(12_000); });
    expect(screen.getByText('图片加载超时')).toBeTruthy();
    expect(screen.getByLabelText('重试图片')).toBeTruthy();
    jest.useRealTimers();
  });
});
