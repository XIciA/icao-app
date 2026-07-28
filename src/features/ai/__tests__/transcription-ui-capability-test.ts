import { TRANSCRIPTION_ACTION_ENABLED as nativeTranscriptionActionEnabled } from '../transcription-ui-capability';
import { TRANSCRIPTION_ACTION_ENABLED as webTranscriptionActionEnabled } from '../transcription-ui-capability.web';

describe('transcription UI capability', () => {
  it('keeps the action enabled for native builds', () => {
    expect(nativeTranscriptionActionEnabled).toBe(true);
  });

  it('hides the action in web builds', () => {
    expect(webTranscriptionActionEnabled).toBe(false);
  });
});
