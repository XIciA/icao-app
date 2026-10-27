import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AppText, BottomSheet, Button } from '@/components/ui';
import { ImageQuestionCard } from '@/features/question-bank/components/ImageQuestionCard';
import { colors, spacing } from '@/theme';
import { RadioImageThumbnail } from './RadioImageThumbnail';
import type { RadioSubtitleMode, RadioTrack } from './types';

/** Mounted per source card by the player so every new question starts at the top. */
export function RadioSubtitles({ track, mode }: { track?: RadioTrack; mode: RadioSubtitleMode }) {
  const [imageOpen, setImageOpen] = useState(false);
  const bilingual = mode === 'bilingual';
  if (mode === 'off') return null;
  return <>
    <ScrollView accessibilityLabel="题目原文与参考答案" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.scroll}>
      {track?.materials?.length ? <View style={styles.materials}>
        {track.materials.map(material => <RadioImageThumbnail key={material.image} {...material} onPress={() => setImageOpen(true)} />)}
      </View> : null}
      <View style={styles.section}>
        <AppText color={colors.mutedForeground} variant="caption">音频原文</AppText>
        <AppText selectable style={styles.english}>{track?.audioText || '当前曲目暂无英文原文。'}</AppText>
        {bilingual ? <AppText selectable style={styles.chinese}>{track?.audioTextZh || '当前曲目暂无中文译文。'}</AppText> : null}
      </View>
      {track?.referenceLabel ? <View style={[styles.section, styles.reference]}>
        <AppText color={colors.mutedForeground} variant="caption">{track.referenceLabel}</AppText>
        <AppText selectable style={styles.english}>{track.referenceText || '当前题目暂无参考答案。'}</AppText>
        {bilingual && track.referenceText ? <AppText selectable style={styles.chinese}>{track.referenceTextZh || '当前参考答案暂无中文译文。'}</AppText> : null}
      </View> : null}
    </ScrollView>
    <BottomSheet accessibilityLabel="题目图片" visible={imageOpen} onClose={() => setImageOpen(false)} footer={<Button onPress={() => setImageOpen(false)}>关闭图片</Button>}>
      {track?.materials?.map(material => <ImageQuestionCard key={material.image} imagePath={material.image} imageAlt={material.imageAlt} />)}
    </BottomSheet>
  </>;
}

const styles = StyleSheet.create({
  scroll: { alignSelf: 'stretch', flex: 1 },
  content: { gap: spacing[5], paddingBottom: spacing[4], paddingHorizontal: spacing[2], paddingTop: spacing[5] },
  section: { gap: spacing[3] },
  reference: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing[5] },
  english: { color: colors.foreground, fontSize: 16, lineHeight: 26 },
  chinese: { color: colors.mutedForeground, fontSize: 14, lineHeight: 23 },
  materials: { gap: spacing[3] },
});
