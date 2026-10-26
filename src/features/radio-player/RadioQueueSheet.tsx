import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, BottomSheet, Button } from '@/components/ui';
import { Check, ChevronDown, ChevronRight, Headphones, Highlighter, NotebookPen, Play, SlidersHorizontal, Tag, X } from '@/components/ui/icons';
import { useAppViewportDimensions } from '@/components/platform/useAppViewportDimensions';
import { useQuestionAnnotations } from '@/features/question-bank/annotations/use-question-annotations';
import { annotationToneColors } from '@/features/question-bank/annotations/colors';
import { formatAudioTime } from '@/features/question-bank/components/AudioTimeline';
import { colors, radii, spacing } from '@/theme';
import { emptyRadioQueueFilter, hasRadioQueueFilter, radioDirectory, radioTrackIdentity, type RadioQueueFilter } from './queue-filter';
import type { RadioPlayerContextValue, RadioTrack } from './types';

type Row = { key: string; title: string; depth: number; tracks: RadioTrack[]; expandable?: boolean; count?: string };
export function RadioQueueSheet({ radio, visible, onClose }: { radio: RadioPlayerContextValue; visible: boolean; onClose: () => void }) {
  const { height } = useAppViewportDimensions();
  const annotations = useQuestionAnnotations();
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<RadioQueueFilter>(emptyRadioQueueFilter);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const catalog = radio.currentCatalog;
  const directory = useMemo(() => radioDirectory(catalog?.tracks ?? []), [catalog]);
  const sourceDirectory = useMemo(() => radioDirectory(radio.catalogs.find(item => item.bankId === catalog?.bankId)?.tracks ?? []), [radio.catalogs, catalog?.bankId]);
  const active = hasRadioQueueFilter(radio.queueFilter ?? emptyRadioQueueFilter);
  const currentTrackRef = useRef(radio.currentTrack); currentTrackRef.current = radio.currentTrack;
  useEffect(() => {
    if (!visible) { setFilterOpen(false); return; }
    const track = currentTrackRef.current;
    setExpanded(new Set(track ? [`category:${track.categoryId}`, `topic:${track.categoryId}:${track.topicId}`] : []));
  }, [visible, catalog?.bankId]);
  const rows = useMemo(() => {
    const result: Row[] = [];
    for (const category of directory) {
      const key = `category:${category.id}`;
      const single = sourceDirectory.find(item => item.id === category.id)?.topics.length === 1;
      result.push({ key, title: category.title, depth: 0, tracks: category.tracks, expandable: true, count: single ? `${category.tracks.length}题` : `${category.topics.length}组 · ${category.tracks.length}题` });
      if (!expanded.has(key)) continue;
      for (const topic of category.topics) {
        const topicKey = `topic:${category.id}:${topic.id}`;
        if (!single) result.push({ key: topicKey, title: topic.title, depth: 1, tracks: topic.tracks, expandable: true, count: `${topic.tracks.length}题` });
        if (single || expanded.has(topicKey)) topic.tracks.forEach(track => result.push({ key: radioTrackIdentity(track), title: track.title, depth: single ? 1 : 2, tracks: [track] }));
      }
    }
    return result;
  }, [directory, sourceDirectory, expanded]);
  const play = (track: RadioTrack) => { radio.selectTrack(track.id, true); onClose(); };
  const toggle = (key: string) => setExpanded(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const toggleColor = (key: 'tagIds' | 'highlightIds', id: string) => setDraft(previous => ({ ...previous, [key]: previous[key].includes(id) ? previous[key].filter(value => value !== id) : [...previous[key], id] }));
  return <BottomSheet accessibilityLabel="播放队列" visible={visible} onClose={onClose} scrollable={false}>
    <View style={{ height: Math.min(height * 0.78, 650) }}>
      <View style={styles.header}>
        <AppText variant="sectionTitle">{filterOpen ? '筛选' : '播放队列'}</AppText>
        {filterOpen ? <Pressable accessibilityRole="button" accessibilityLabel="关闭筛选" onPress={() => setFilterOpen(false)} style={styles.iconButton}><X size={21} color={colors.foreground} /></Pressable>
          : <Pressable accessibilityRole="button" accessibilityLabel={active ? '修改筛选' : '筛选播放队列'} disabled={!radio.setQueueFilter} onPress={() => { setDraft(radio.queueFilter ?? emptyRadioQueueFilter); setFilterOpen(true); }} style={({ pressed }) => [styles.filterButton, pressed && styles.pressed]}><SlidersHorizontal size={18} color={active ? colors.primary : colors.mutedForeground} /><AppText color={active ? colors.primary : colors.mutedForeground}>{active ? '已筛选' : '筛选'}</AppText></Pressable>}
      </View>
      {filterOpen ? <>
        <ScrollView style={styles.list} contentContainerStyle={styles.filterContent}>
          {!annotations.hydrated ? <ActivityIndicator color={colors.primary} /> : annotations.loadErrorMessage ? <Button onPress={() => void annotations.refresh()} >重新读取标注</Button> : null}
          {([{ key: 'tags', label: '标签', Icon: Tag, definitions: annotations.tagDefinitions, ids: 'tagIds' }, { key: 'highlights', label: '高亮', Icon: Highlighter, definitions: annotations.highlightDefinitions, ids: 'highlightIds' }, { key: 'notes', label: '笔记', Icon: NotebookPen }] as const).map(item => <View key={item.key} style={styles.filterGroup}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: draft[item.key] }} onPress={() => setDraft(previous => ({ ...previous, [item.key]: !previous[item.key] }))} style={styles.filterRow}>
              <View style={[styles.checkbox, draft[item.key] && styles.checked]}>{draft[item.key] && <Check size={15} color={colors.primaryForeground} />}</View><item.Icon size={20} color={colors.foreground} /><AppText variant="button">{item.label}</AppText>
            </Pressable>
            {item.key !== 'notes' && draft[item.key] ? <View style={styles.options}>
              <Pressable accessibilityRole="button" accessibilityState={{ selected: !draft[item.ids].length }} onPress={() => setDraft(previous => ({ ...previous, [item.ids]: [] }))} style={[styles.chip, !draft[item.ids].length && styles.selected]}><AppText color={!draft[item.ids].length ? colors.primary : colors.mutedForeground}>全部</AppText></Pressable>
              {item.definitions.map(definition => <Pressable key={definition.id} accessibilityRole="checkbox" accessibilityLabel={`${item.label}：${definition.label}`} accessibilityState={{ checked: draft[item.ids].includes(definition.id) }} onPress={() => toggleColor(item.ids, definition.id)} style={[styles.chip, draft[item.ids].includes(definition.id) && styles.selected]}><View style={[styles.dot, { backgroundColor: annotationToneColors[definition.color] }]} /><AppText>{definition.label}</AppText>{draft[item.ids].includes(definition.id) ? <Check size={13} color={colors.primary} /> : null}</Pressable>)}
            </View> : null}
          </View>)}
        </ScrollView>
        <View style={styles.footer}><Button variant="ghost" onPress={() => setDraft(emptyRadioQueueFilter)} >重置</Button><View style={styles.grow}><Button disabled={!annotations.hydrated || Boolean(annotations.loadErrorMessage)} onPress={() => { radio.setQueueFilter?.(draft); setFilterOpen(false); }} >完成</Button></View></View>
      </> : <FlatList<Row> data={rows} keyExtractor={item => item.key} style={styles.list} initialNumToRender={16} contentContainerStyle={!rows.length ? styles.empty : undefined}
        ListEmptyComponent={radio.catalogLoading ? <ActivityIndicator color={colors.primary} /> : <View style={styles.emptyCopy}><AppText>{active ? '没有符合条件的题目' : '暂无可播放题目'}</AppText>{active ? <Button variant="ghost" onPress={() => radio.setQueueFilter?.(emptyRadioQueueFilter)} >清除筛选</Button> : radio.catalogError ? <Button onPress={radio.retryCatalog} >重试</Button> : null}</View>}
        renderItem={({ item }) => {
          const track = item.tracks[0];
          const current = !item.expandable && track.id === radio.currentTrack?.id;
          return <View style={[styles.row, { marginLeft: item.depth * spacing[4] }, current && styles.current]}>
            <Pressable accessibilityRole="button" accessibilityLabel={item.expandable ? `${expanded.has(item.key) ? '收起' : '展开'}${item.title}` : `播放 ${item.title}`} accessibilityState={item.expandable ? { expanded: expanded.has(item.key) } : { selected: current }} onPress={() => item.expandable ? toggle(item.key) : play(track)} style={styles.rowMain}>
              <View style={styles.grow}><AppText numberOfLines={2} variant={item.depth === 0 ? 'cardTitle' : 'body'} color={current ? colors.primary : colors.foreground}>{item.title}</AppText>{item.count ? <AppText variant="caption">{item.count}</AppText> : <AppText variant="caption">{track.requiresMembership ? '会员 · ' : ''}{formatAudioTime(track.durationSeconds)}</AppText>}</View>
              {item.expandable ? expanded.has(item.key) ? <ChevronDown size={18} color={colors.mutedForeground} /> : <ChevronRight size={18} color={colors.mutedForeground} /> : current ? <Headphones size={17} color={colors.primary} /> : null}
            </Pressable>
            {item.expandable ? <Pressable accessibilityRole="button" accessibilityLabel={`从${item.title}开始播放`} onPress={() => play(track)} style={styles.iconButton}><Play size={19} color={colors.primary} /></Pressable> : null}
          </View>;
        }} />}
    </View>
  </BottomSheet>;
}
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: spacing[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  filterButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[2] },
  iconButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 }, list: { flex: 1 }, grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[2], minHeight: 64, paddingVertical: spacing[3], paddingHorizontal: spacing[2] },
  current: { backgroundColor: colors.primary06 },
  empty: { flexGrow: 1, justifyContent: 'center' }, emptyCopy: { alignItems: 'center', gap: spacing[3] },
  filterContent: { paddingBottom: spacing[4] },
  filterGroup: { paddingVertical: spacing[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  filterRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  checkbox: { width: 20, height: 20, borderWidth: 1, borderColor: colors.mutedForeground, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  checked: { backgroundColor: colors.primary, borderColor: colors.primary },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[2] },
  chip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[3], borderWidth: 1, borderColor: colors.border, borderRadius: radii.full },
  selected: { borderColor: colors.primary, backgroundColor: colors.primary06 }, dot: { width: 12, height: 12, borderRadius: radii.full },
  footer: { flexDirection: 'row', gap: spacing[3], alignItems: 'center', paddingTop: spacing[4] },
});
