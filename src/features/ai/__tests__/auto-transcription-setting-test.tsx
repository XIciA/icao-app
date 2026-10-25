import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AutoTranscriptionSetting } from '../AutoTranscriptionSetting';
import { autoTranscriptionAcknowledged, autoTranscriptionEnabled, setAutoTranscriptionEnabled } from '../auto-transcription.native';
import { acceptAiConsent, hasAiConsent } from '../ai-client.native';

jest.mock('../auto-transcription.native', () => ({ autoTranscriptionOwnerKey: () => 'owner-a', autoTranscriptionAcknowledged: jest.fn(async () => false), autoTranscriptionEnabled: jest.fn(async () => false), setAutoTranscriptionEnabled: jest.fn(async () => undefined) }));
jest.mock('../ai-client.native', () => ({ acceptAiConsent: jest.fn(async () => undefined), hasAiConsent: jest.fn(async () => true) }));
jest.mock('react-native-safe-area-context', () => ({ ...jest.requireActual('react-native-safe-area-context/jest/mock').default, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
beforeEach(() => { jest.clearAllMocks(); jest.mocked(autoTranscriptionAcknowledged).mockResolvedValue(false); jest.mocked(autoTranscriptionEnabled).mockResolvedValue(false); jest.mocked(hasAiConsent).mockResolvedValue(true); });
it('shows the first automatic-upload explanation even with valid AI consent, and reuses that consent', async () => {
  const screen = await render(<AutoTranscriptionSetting />);
  await fireEvent(screen.getByLabelText('录音后自动转写'), 'valueChange', true);
  await waitFor(() => expect(screen.getByText('同意并开启')).toBeTruthy());
  expect(setAutoTranscriptionEnabled).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('同意并开启'));
  await waitFor(() => expect(setAutoTranscriptionEnabled).toHaveBeenCalledWith(true, 'owner-a'));
  expect(acceptAiConsent).not.toHaveBeenCalled();
});
it('does not repeat the automatic-upload explanation after a previous valid acknowledgement', async () => {
  jest.mocked(autoTranscriptionAcknowledged).mockResolvedValue(true);
  const screen = await render(<AutoTranscriptionSetting />);
  await fireEvent(screen.getByLabelText('录音后自动转写'), 'valueChange', true);
  await waitFor(() => expect(setAutoTranscriptionEnabled).toHaveBeenCalledWith(true, 'owner-a'));
  expect(screen.queryByText('同意并开启')).toBeNull(); expect(acceptAiConsent).not.toHaveBeenCalled();
});
it('does not enable when dismissed; reacquires revoked AI consent only after confirmation', async () => {
  jest.mocked(hasAiConsent).mockResolvedValue(false);
  const screen = await render(<AutoTranscriptionSetting />);
  await fireEvent(screen.getByLabelText('录音后自动转写'), 'valueChange', true);
  await waitFor(() => expect(screen.getByText('暂不开启')).toBeTruthy());
  await fireEvent.press(screen.getByText('暂不开启'));
  expect(acceptAiConsent).not.toHaveBeenCalled(); expect(setAutoTranscriptionEnabled).not.toHaveBeenCalled();
  await fireEvent(screen.getByLabelText('录音后自动转写'), 'valueChange', true);
  await waitFor(() => expect(screen.getByText('同意并开启')).toBeTruthy());
  await act(async () => { await fireEvent.press(screen.getByText('同意并开启')); });
  expect(acceptAiConsent).toHaveBeenCalledTimes(1); expect(setAutoTranscriptionEnabled).toHaveBeenCalledTimes(1);
});
