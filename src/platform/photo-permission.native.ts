import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking, Platform } from 'react-native';

/** Call only after a user asks to select photos. Recheck on every selection attempt. */
export async function requestPhotoSelectionPermission(retry: () => void, isCurrent: () => boolean = () => true) {
  // The browser file chooser owns its permission UI.
  if (Platform.OS === 'web') return true;
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!isCurrent()) return false;
  if (permission.granted || permission.accessPrivileges === 'limited') return true;
  const canAskAgain = permission.canAskAgain === true;
  Alert.alert('需要照片访问权限', canAskAgain
    ? '选择图片需要你的授权。点击“再次授权”后，在系统弹窗中允许访问照片；也可以暂不添加图片。'
    : '系统目前未允许访问照片，App 无法再次弹出授权请求。请打开系统设置，在本 App 的照片权限中允许访问。返回后再次点击选择图片即可继续。', [
    { text: '暂不添加', style: 'cancel' },
    canAskAgain ? { text: '再次授权', onPress: () => { if (isCurrent()) retry(); } } : {
      text: '打开设置', onPress: () => {
        if (!isCurrent()) return;
        void Linking.openSettings().catch(() => {
          if (isCurrent()) Alert.alert('未能打开系统设置', '请手动打开系统“设置”，找到本 App 的照片权限并允许访问，返回后再选择图片。');
        });
      },
    },
  ]);
  return false;
}
