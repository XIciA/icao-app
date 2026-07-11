import { useRouter } from 'expo-router';
import { Bookmark, Highlighter, NotebookPen } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Card, Screen, Tag } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

import { getEmbeddedQuestionBanks } from '../data/repository';
import { sqliteLearningStore } from '../platform/learning-store';
import type { CardLearningState, QuestionBankId } from '../types';

type Item = {
  bankId: QuestionBankId;
  bankTitle: string;
  categoryId: string;
  categoryTitle: string;
  topicId: string;
  topicTitle: string;
  cardId: string;
  cardTitle: string;
  state: CardLearningState;
};

export function MyAnnotationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>();
  useEffect(() => {
    let active = true;
    const tasks = getEmbeddedQuestionBanks().flatMap((bank) => bank.categories.flatMap((category) => category.topics.map(async (topic) => {
      const states = await sqliteLearningStore.getTopicStates(topic);
      return topic.cards.flatMap((card) => {
        const state = states[card.id];
        return state && (state.note.trim() || state.tagIds?.length || state.highlights?.length) ? [{
          bankId: bank.id,
          bankTitle: bank.title,
          categoryId: category.id,
          categoryTitle: category.name,
          topicId: topic.id,
          topicTitle: topic.name,
          cardId: card.id,
          cardTitle: card.taskTitle,
          state,
        }] : [];
      });
    })));
    void Promise.all(tasks).then((groups) => { if (active) setItems(groups.flat().sort((a, b) => b.state.updatedAt.localeCompare(a.state.updatedAt))); });
    return () => { active = false; };
  }, []);

  return (
    <Screen scroll contentStyle={styles.screen}>
      <TopBar title="我的标注" />
      <View style={styles.header}><AppText color={colors.primary} variant="micro">ANNOTATIONS</AppText><AppText variant="pageTitle">标签、高亮与笔记</AppText><AppText>所有内容仅保存在当前设备，点击可回到原题。</AppText></View>
      <View style={styles.list}>
        {items?.length ? items.map((item) => (
          <Pressable
            key={`${item.bankId}:${item.cardId}`}
            onPress={() => router.push({ pathname: '/question-bank/[bankId]/study/[categoryId]/[topicId]', params: { bankId: item.bankId, categoryId: item.categoryId, topicId: item.topicId, cardId: item.cardId } })}
          >
            <Card style={styles.card}>
              <View style={styles.titleRow}><Bookmark color={colors.primary} size={18} /><View style={styles.copy}><AppText variant="cardTitle">{item.cardTitle}</AppText><AppText variant="caption">{item.bankTitle} · {item.categoryTitle} · {item.topicTitle}</AppText></View></View>
              {item.state.note.trim() ? <View style={styles.note}><NotebookPen color={colors.primary} size={15} /><AppText style={styles.copy} numberOfLines={3}>{item.state.note}</AppText></View> : null}
              <View style={styles.tags}>
                {item.state.tagIds?.map((tag) => <Tag key={tag}>{tag === 'good' ? '好题' : tag === 'memory' ? '记忆' : '不懂'}</Tag>)}
                {item.state.highlights?.length ? <View style={styles.highlightCount}><Highlighter color={colors.primary} size={13} /><AppText variant="micro">{item.state.highlights.length} 处高亮</AppText></View> : null}
              </View>
            </Card>
          </Pressable>
        )) : items ? <Card style={styles.empty}><Bookmark color={colors.mutedForeground} size={28} /><AppText variant="cardTitle">还没有标注</AppText><AppText>在学习卡中添加标签、高亮或笔记后会显示在这里。</AppText></Card> : <AppText>正在汇总本地标注…</AppText>}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  header: { gap: spacing[1], paddingHorizontal: spacing[5], paddingVertical: spacing[4] },
  list: { gap: spacing[3], paddingBottom: spacing[6] },
  card: { gap: spacing[3] },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[2.5] },
  copy: { flex: 1 },
  note: { backgroundColor: colors.primary06, borderRadius: radii.lg, flexDirection: 'row', gap: spacing[2], padding: spacing[3] },
  tags: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  highlightCount: { alignItems: 'center', flexDirection: 'row', gap: spacing[1] },
  empty: { alignItems: 'center', gap: spacing[2], paddingVertical: spacing[6] },
});
