import { TRANSCRIPTION_ACTION_ENABLED } from '../transcription-ui-capability.web';

describe('transcription UI capability', () => {
  it('hides the action in web builds', () => {
    expect(TRANSCRIPTION_ACTION_ENABLED).toBe(false);
  });
});
