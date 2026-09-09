import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { UserRound } from '@/components/ui/icons';
import { colors, radii } from '@/theme';

export function ProfileAvatar({ uri, size = 56 }: { uri: string | null; size?: number }) {
  const [failedUri, setFailedUri] = useState<string>();
  return (
    <View accessibilityLabel="用户头像" style={[styles.avatar, { width: size, height: size }]}>
      {uri && uri !== failedUri ? (
        <Image onError={() => setFailedUri(uri)} source={{ uri }} style={{ width: size, height: size }} />
      ) : <UserRound color={colors.primary} size={size / 2} />}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.primary10, borderRadius: radii.full },
});
