import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';
import { useQuestionBankAsset } from '@/features/question-bank/hooks/useQuestionBankAsset';
import { colors, radii, spacing } from '@/theme';

export function RadioImageThumbnail({ image, imageAlt, onPress }: { image: string; imageAlt: string; onPress: () => void }) {
  const asset = useQuestionBankAsset(image);
  const [failed, setFailed] = useState(false);
  return <Pressable accessibilityLabel="查看题目大图" onPress={onPress} style={styles.row}>
    <View style={styles.frame}>
      {asset.uri && !failed ? <Image accessibilityLabel={imageAlt} contentFit="contain" source={asset.uri} style={styles.image} onError={() => setFailed(true)} /> : asset.resolving ? <ActivityIndicator color={colors.primary} /> : <AppText variant="micro">图片暂不可用</AppText>}
    </View>
    <View style={styles.copy}><AppText variant="button">题目图片</AppText><AppText color={colors.primary} variant="caption">查看大图</AppText></View>
  </Pressable>;
}
const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  frame: { alignItems: 'center', backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, height: 72, justifyContent: 'center', overflow: 'hidden', width: 108 },
  image: { height: '100%', width: '100%' },
  copy: { gap: spacing[1] },
});
