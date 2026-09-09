import { fireEvent, render } from '@testing-library/react-native';
import { ExamSpeakingPractice } from '../components/ExamSpeakingPractice.native';
import type { RecordingAsset } from '../recording/types';
const mockController = { phase: 'idle', asset: undefined as RecordingAsset | undefined, durationMillis: 0, pressIn: jest.fn(), pressOut: jest.fn(async () => undefined), retryPermission: jest.fn(), permissionDenied: false, error: undefined };
jest.mock('../recording/use-speaking-recording-controller', () => ({ SpeakingRecordingControllerHost: ({ children }: { children: (controller: typeof mockController) => React.ReactNode }) => children(mockController) }));
it('keeps the existing recording controller, permits rerecording, and never mounts playback controls', async () => {
  const props = { cardId: 'card', sessionId: 'session', onClear: jest.fn(), onRecorded: jest.fn(), onRecordingIntent: jest.fn() };
  const screen = await render(<ExamSpeakingPractice {...props} />);
  expect(screen.getByText('按住说话')).toBeTruthy();
  mockController.asset = { id: 'recording', cardId: 'card', sessionId: 'session', uri: 'file:///temporary.m4a', durationMillis: 2100, byteSize: 20000, mimeType: 'audio/mp4', format: 'm4a', storageKind: 'native-file', createdAt: '2026-09-09T00:00:00Z' };
  await screen.rerender(<ExamSpeakingPractice {...props} />);
  await fireEvent(screen.getByLabelText('按住重新录音'), 'pressIn');
  await fireEvent(screen.getByLabelText('按住重新录音'), 'pressOut');
  expect(mockController.pressIn).toHaveBeenCalledTimes(1); expect(props.onRecordingIntent).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/回放|回听|播放|暂停/u)).toBeNull(); expect(screen.getByText('按住重录')).toBeTruthy();
});
