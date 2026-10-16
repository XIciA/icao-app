import { Alert, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { requestPhotoSelectionPermission } from '../photo-permission.native';
jest.mock('expo-image-picker', () => ({ requestMediaLibraryPermissionsAsync: jest.fn() }));
const request = jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync);
const alert = jest.spyOn(Alert, 'alert');
const settings = jest.spyOn(Linking, 'openSettings');
const permission = (value: object) => value as ImagePicker.MediaLibraryPermissionResponse;
beforeEach(() => { jest.clearAllMocks(); Platform.OS = 'ios'; settings.mockResolvedValue(); });
it('offers another explicit request when the OS allows one', async () => {
  request.mockResolvedValue(permission({ granted: false, canAskAgain: true }));
  const retry = jest.fn();
  expect(await requestPhotoSelectionPermission(retry)).toBe(false);
  alert.mock.calls[0][2]?.find(button => button.text === '再次授权')?.onPress?.();
  expect(retry).toHaveBeenCalledTimes(1);
  expect(settings).not.toHaveBeenCalled();
});
it('opens settings when denied permanently and explains how to resume', async () => {
  request.mockResolvedValue(permission({ granted: false, canAskAgain: false }));
  await requestPhotoSelectionPermission(jest.fn());
  expect(alert.mock.calls[0][1]).toContain('返回后再次点击');
  alert.mock.calls[0][2]?.find(button => button.text === '打开设置')?.onPress?.();
  expect(settings).toHaveBeenCalledTimes(1);
});
it('uses limited access and rechecks permission on the next attempt', async () => {
  request.mockResolvedValueOnce(permission({ granted: false, accessPrivileges: 'limited' })).mockResolvedValueOnce(permission({ granted: true }));
  expect(await requestPhotoSelectionPermission(jest.fn())).toBe(true);
  expect(await requestPhotoSelectionPermission(jest.fn())).toBe(true);
  expect(request).toHaveBeenCalledTimes(2);
  expect(alert).not.toHaveBeenCalled();
});
it('does not show a late dialog after leaving the screen', async () => {
  request.mockResolvedValue(permission({ granted: false, canAskAgain: false }));
  await requestPhotoSelectionPermission(jest.fn(), () => false);
  expect(alert).not.toHaveBeenCalled();
});
it('does not request native photo permission in a browser', async () => {
  Platform.OS = 'web';
  expect(await requestPhotoSelectionPermission(jest.fn())).toBe(true);
  expect(request).not.toHaveBeenCalled();
});
