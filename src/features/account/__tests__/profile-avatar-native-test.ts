import { requireOptionalNativeModule } from 'expo-modules-core';
import { prepareProfileAvatar } from '../../../../modules/icao-profile-avatar/src';

jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: jest.fn() }));
const jpeg = 'data:image/jpeg;base64,/9j/AA==';

it('passes a local camera image URI to the native downsampler and returns its actual JPEG', async () => {
  const prepareAvatar = jest.fn().mockResolvedValue(jpeg);
  jest.mocked(requireOptionalNativeModule).mockReturnValue({ prepareAvatar });
  expect(await prepareProfileAvatar('file:///photos/large-camera.HEIC')).toBe(jpeg);
  expect(prepareAvatar).toHaveBeenCalledWith('file:///photos/large-camera.HEIC');
  expect(await prepareProfileAvatar('content://media/photo/1')).toBe(jpeg);
});

it('refuses wrongly labelled or oversized results instead of saving invalid profile data', async () => {
  const prepareAvatar = jest.fn().mockResolvedValue('data:image/png;base64,AAAA');
  jest.mocked(requireOptionalNativeModule).mockReturnValue({ prepareAvatar });
  await expect(prepareProfileAvatar('file:///photo.png')).rejects.toThrow('invalid image');
  prepareAvatar.mockResolvedValue(`data:image/jpeg;base64,${'A'.repeat(180_000)}`);
  await expect(prepareProfileAvatar('file:///photo.png')).rejects.toThrow('invalid image');
});

it('fails without a native module and never downloads a remote image', async () => {
  jest.mocked(requireOptionalNativeModule).mockReturnValue(null);
  await expect(prepareProfileAvatar('file:///photo.png')).rejects.toThrow('unavailable');
  await expect(prepareProfileAvatar('https://example.com/photo.png')).rejects.toThrow('local image');
});
