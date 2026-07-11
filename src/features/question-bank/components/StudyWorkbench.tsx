import { Check, Eraser, Mic, NotebookPen, Sparkles } from 'lucide-react-native';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

import type { StudyConsoleTab, StudyReviewKind } from '../types';

const labels: Record<StudyConsoleTab, string> = {
  mine: '我的回答',
  reference: '参考答案',
  notes: '笔记',
};

function normalizeExactText(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

export function StudyWorkbench({
  cardKey,
  tabs,
  activeTab,
  referenceLabel,
  answerText,
  questionText,
  reviewKind,
  referenceContent,
  noteText,
  saveError,
  onTabChange,
  onAnswerChange,
  onNoteChange,
  onRetrySave,
  onFeedback,
}: {
  cardKey: string;
  tabs: StudyConsoleTab[];
  activeTab: StudyConsoleTab;
  referenceLabel: string;
  answerText: string;
  questionText: string;
  reviewKind: StudyReviewKind;
  referenceContent: ReactNode;
  noteText: string;
  saveError?: string;
  onTabChange: (tab: StudyConsoleTab) => void;
  onAnswerChange: (text: string) => void;
  onNoteChange: (text: string) => void;
  onRetrySave: () => void;
  onFeedback: () => void;
}) {
  const [reviewMessage, setReviewMessage] = useState<string>();
  const activeIndex = Math.max(0, tabs.indexOf(activeTab));
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 18 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderRelease: (_, gesture) => {
      if (tabs.length < 2) return;
      if (gesture.dx < -45) onTabChange(tabs[(activeIndex + 1) % tabs.length]);
      if (gesture.dx > 45) onTabChange(tabs[(activeIndex - 1 + tabs.length) % tabs.length]);
    },
  }), [activeIndex, onTabChange, tabs]);

  useEffect(() => setReviewMessage(undefined), [cardKey]);

  function reviewAnswer() {
    if (!answerText.trim()) return;
    onFeedback();
    if (reviewKind === 'exact-match') {
      const exact = normalizeExactText(answerText) === normalizeExactText(questionText);
      setReviewMessage(exact ? '与原文一致，继续保持。' : '与原文存在差异，请结合原文检查遗漏、数字和关键表达。');
      return;
    }
    setReviewMessage(reviewKind === 'opi-placeholder'
      ? '表达分析服务待接入；当前录音和输入仅保存在本次学习会话。'
      : '语法检查服务待接入；当前录音和输入仅保存在本次学习会话。');
  }

  const title = activeTab === 'reference' ? referenceLabel : labels[activeTab];

  return (
    <View style={styles.root}>
      <View {...panResponder.panHandlers} style={styles.header}>
        <View style={styles.titleRow}>
          {activeTab === 'mine' ? <Mic color={colors.primary} size={16} /> : activeTab === 'notes' ? <NotebookPen color={colors.primary} size={16} /> : <Check color={colors.primary} size={16} />}
          <AppText color={colors.primary} variant="button">{title}</AppText>
        </View>
        {activeTab === 'mine' ? (
          <Pressable accessibilityLabel="清空我的回答" disabled={!answerText} onPress={() => onAnswerChange('')} style={[styles.smallAction, !answerText ? styles.disabled : null]}>
            <Eraser color={colors.mutedForeground} size={13} />
            <AppText variant="micro">清空</AppText>
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {activeTab === 'mine' ? (
          <View style={styles.panel}>
            <TextInput
              accessibilityLabel="我的回答"
              multiline
              onChangeText={onAnswerChange}
              placeholder="录音转写待接入，也可以直接输入回答…"
              placeholderTextColor={colors.mutedForeground}
              style={styles.input}
              textAlignVertical="top"
              value={answerText}
            />
            {reviewKind !== 'none' ? (
              <Button
                disabled={!answerText.trim()}
                leading={<Sparkles color={answerText.trim() ? colors.foreground : colors.mutedForeground} size={14} />}
                onPress={reviewAnswer}
                size="sm"
                variant="outline"
              >
                {reviewKind === 'exact-match' ? '对比原文' : reviewKind === 'opi-placeholder' ? '分析表达' : '检查语法'}
              </Button>
            ) : null}
            {reviewMessage ? <View style={styles.feedback}><AppText variant="caption">{reviewMessage}</AppText></View> : null}
          </View>
        ) : activeTab === 'reference' ? referenceContent : (
          <View style={styles.panel}>
            <TextInput
              accessibilityLabel="学习笔记"
              multiline
              onChangeText={onNoteChange}
              placeholder="记生词、要点、易错表达…"
              placeholderTextColor={colors.mutedForeground}
              style={styles.input}
              textAlignVertical="top"
              value={noteText}
            />
            {saveError ? <View style={styles.errorRow}><AppText color={colors.destructive} style={styles.flex} variant="micro">{saveError}</AppText><Pressable onPress={onRetrySave}><AppText color={colors.destructive} variant="micro">重试</AppText></Pressable></View> : <AppText color={colors.primary} variant="micro">已保存到本机 · 云同步待接入</AppText>}
          </View>
        )}
      </ScrollView>

      {tabs.length > 1 ? <View style={styles.dots}>{tabs.map((tab) => <Pressable accessibilityLabel={`切换到${tab === 'reference' ? referenceLabel : labels[tab]}`} key={tab} onPress={() => onTabChange(tab)} style={[styles.dot, tab === activeTab ? styles.dotActive : null]} />)}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: spacing[4], paddingTop: spacing[2] },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  smallAction: { alignItems: 'center', backgroundColor: colors.secondary, borderRadius: radii.full, flexDirection: 'row', gap: spacing[1], paddingHorizontal: spacing[2.5], paddingVertical: spacing[1.5] },
  disabled: { opacity: 0.4 },
  content: { flexGrow: 1, paddingBottom: spacing[2], paddingHorizontal: spacing[4] },
  panel: { gap: spacing[2] },
  input: { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: radii.xl, borderWidth: 1, color: colors.foreground, minHeight: 92, padding: spacing[3] },
  feedback: { backgroundColor: colors.primary06, borderColor: colors.primary20, borderRadius: radii.lg, borderWidth: 1, padding: spacing[3] },
  errorRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  flex: { flex: 1 },
  dots: { alignItems: 'center', flexDirection: 'row', gap: spacing[1.5], justifyContent: 'center', paddingBottom: spacing[3], paddingTop: spacing[1] },
  dot: { backgroundColor: colors.border, borderRadius: radii.full, height: 6, width: 6 },
  dotActive: { backgroundColor: colors.primary, width: 18 },
});
