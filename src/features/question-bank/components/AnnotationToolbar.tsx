import { Check, Highlighter, Plus, Search, Tags, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

import type { AnnotationDefinition, AnnotationToneKey } from '../annotations/types';

const toneColors: Record<AnnotationToneKey, string> = {
  green: '#45A26B',
  yellow: '#D6A72D',
  red: '#D94A53',
  blue: colors.primary,
};

type CreatorKind = 'tag' | 'highlight';

export function AnnotationToolbar({
  activeHighlightId,
  dictionaryMode,
  highlightDefinitions,
  highlightMode,
  onCreateHighlight,
  onCreateTag,
  onDictionaryModeChange,
  onHighlightChange,
  onHighlightModeChange,
  onTagToggle,
  selectedTags,
  showDictionary,
  showHighlights,
  showTags,
  tagDefinitions,
  resetToken,
}: {
  activeHighlightId: string;
  dictionaryMode: boolean;
  highlightDefinitions: AnnotationDefinition[];
  highlightMode: boolean;
  onCreateHighlight: (label: string, color: AnnotationToneKey) => void;
  onCreateTag: (label: string, color: AnnotationToneKey) => void;
  onDictionaryModeChange: (value: boolean) => void;
  onHighlightChange: (id: string) => void;
  onHighlightModeChange: (value: boolean) => void;
  onTagToggle: (id: string) => void;
  selectedTags: string[];
  showDictionary: boolean;
  showHighlights: boolean;
  showTags: boolean;
  tagDefinitions: AnnotationDefinition[];
  resetToken: string | number;
}) {
  const [tagsOpen, setTagsOpen] = useState(false);
  const [creator, setCreator] = useState<CreatorKind>();
  const [name, setName] = useState('');
  const [tone, setTone] = useState<AnnotationToneKey>('green');

  useEffect(() => {
    setTagsOpen(false);
    setCreator(undefined);
    setName('');
  }, [resetToken]);

  function closeCreator() {
    setCreator(undefined);
    setName('');
    setTone('green');
  }

  function submitCreator() {
    const label = name.trim();
    if (!label || !creator) return;
    if (creator === 'tag') onCreateTag(label, tone);
    else onCreateHighlight(label, tone);
    closeCreator();
  }

  function toggleDictionary() {
    const next = !dictionaryMode;
    setTagsOpen(false);
    closeCreator();
    if (next) onHighlightModeChange(false);
    onDictionaryModeChange(next);
  }

  function toggleHighlightMode() {
    const next = !highlightMode;
    setTagsOpen(false);
    closeCreator();
    if (next) onDictionaryModeChange(false);
    onHighlightModeChange(next);
  }

  function toggleTags() {
    const next = !tagsOpen;
    setTagsOpen(next);
    closeCreator();
    if (next) {
      onDictionaryModeChange(false);
      onHighlightModeChange(false);
    }
  }

  const visibleCreator = creator && ((creator === 'tag' && tagsOpen) || (creator === 'highlight' && highlightMode));

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        {showDictionary ? (
          <Pressable accessibilityLabel={dictionaryMode ? '关闭查词模式' : '开启查词模式'} onPress={toggleDictionary} style={[styles.tool, dictionaryMode ? styles.toolActive : null]}>
            <Search color={dictionaryMode ? colors.primary : colors.mutedForeground} size={14} />
            <AppText color={dictionaryMode ? colors.primary : colors.mutedForeground} variant="caption">查词</AppText>
          </Pressable>
        ) : null}
        {showHighlights ? (
          <Pressable accessibilityLabel={highlightMode ? '关闭高亮模式' : '开启高亮模式'} onPress={toggleHighlightMode} style={[styles.tool, highlightMode ? styles.toolActive : null]}>
            <Highlighter color={highlightMode ? colors.primary : colors.mutedForeground} size={14} />
            <AppText color={highlightMode ? colors.primary : colors.mutedForeground} variant="caption">高亮</AppText>
          </Pressable>
        ) : null}
        {showTags ? (
          <Pressable accessibilityLabel={tagsOpen ? '关闭标签面板' : '打开标签面板'} onPress={toggleTags} style={[styles.tool, tagsOpen || selectedTags.length ? styles.toolActive : null]}>
            <Tags color={tagsOpen || selectedTags.length ? colors.primary : colors.mutedForeground} size={14} />
            <AppText color={tagsOpen || selectedTags.length ? colors.primary : colors.mutedForeground} variant="caption">标签 {selectedTags.length}</AppText>
          </Pressable>
        ) : null}
      </View>

      {tagsOpen ? (
        <ToolOptions
          definitions={tagDefinitions}
          onCreate={() => setCreator('tag')}
          onSelect={onTagToggle}
          selectedIds={selectedTags}
        />
      ) : null}
      {highlightMode ? (
        <ToolOptions
          definitions={highlightDefinitions}
          hint="轻点单词，或按住后拖动高亮"
          onCreate={() => setCreator('highlight')}
          onSelect={onHighlightChange}
          selectedIds={[activeHighlightId]}
        />
      ) : null}
      {visibleCreator ? (
        <View style={styles.creator}>
          <TextInput
            accessibilityLabel={creator === 'tag' ? '新标签名称' : '新高亮名称'}
            autoFocus
            maxLength={8}
            onChangeText={setName}
            onSubmitEditing={submitCreator}
            placeholder="名称"
            placeholderTextColor={colors.mutedForeground}
            style={styles.input}
            value={name}
          />
          <View style={styles.creatorFooter}>
            <View style={styles.tones}>
              {(Object.keys(toneColors) as AnnotationToneKey[]).map((key) => (
                <Pressable accessibilityLabel={`颜色 ${key}`} key={key} onPress={() => setTone(key)} style={[styles.toneButton, tone === key ? styles.toneSelected : null]}>
                  <View style={[styles.toneDot, { backgroundColor: toneColors[key] }]} />
                </Pressable>
              ))}
            </View>
            <Pressable accessibilityLabel="取消新建" onPress={closeCreator} style={styles.iconButton}><X color={colors.mutedForeground} size={15} /></Pressable>
            <Pressable accessibilityLabel="确认新建" disabled={!name.trim()} onPress={submitCreator} style={[styles.confirmButton, !name.trim() ? styles.disabled : null]}><Check color={colors.primaryForeground} size={15} /></Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ToolOptions({ definitions, hint, onCreate, onSelect, selectedIds }: {
  definitions: AnnotationDefinition[];
  hint?: string;
  onCreate: () => void;
  onSelect: (id: string) => void;
  selectedIds: string[];
}) {
  return (
    <View style={styles.section}>
      {hint ? <AppText color={colors.mutedForeground} variant="micro">{hint}</AppText> : null}
      <View style={styles.options}>
        {definitions.map((definition) => {
          const selected = selectedIds.includes(definition.id);
          return (
            <Pressable
              accessibilityLabel={`${selected ? '取消选择' : '选择'}${definition.label}`}
              key={definition.id}
              onPress={() => onSelect(definition.id)}
              style={[styles.pill, selected ? styles.pillSelected : null]}
            >
              <View style={[styles.dot, { backgroundColor: toneColors[definition.color] }]} />
              <AppText color={selected ? colors.foreground : colors.mutedForeground} variant="micro">{definition.label}</AppText>
              {selected ? <Check color={colors.primary} size={12} /> : null}
            </Pressable>
          );
        })}
        <Pressable accessibilityLabel="新建标注定义" onPress={onCreate} style={styles.addButton}><Plus color={colors.mutedForeground} size={15} /></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: spacing[2] },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  section: { backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.xl, borderWidth: 1, gap: spacing[2], padding: spacing[2] },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  pill: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], minHeight: 30, paddingHorizontal: spacing[2.5] },
  pillSelected: { backgroundColor: colors.primary06, borderColor: colors.primary },
  dot: { borderRadius: radii.full, height: 8, width: 8 },
  tool: { alignItems: 'center', backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], minHeight: 30, paddingHorizontal: spacing[3] },
  toolActive: { backgroundColor: colors.primary06, borderColor: colors.primary },
  addButton: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, height: 30, justifyContent: 'center', width: 30 },
  creator: { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: radii.xl, borderWidth: 1, gap: spacing[2], padding: spacing[2.5] },
  input: { backgroundColor: colors.card, borderColor: colors.input, borderRadius: radii.md, borderWidth: 1, color: colors.foreground, minHeight: 36, paddingHorizontal: spacing[3] },
  creatorFooter: { alignItems: 'center', flexDirection: 'row', gap: spacing[1.5] },
  tones: { flex: 1, flexDirection: 'row', gap: spacing[1.5] },
  toneButton: { alignItems: 'center', borderColor: 'transparent', borderRadius: radii.full, borderWidth: 2, height: 28, justifyContent: 'center', width: 28 },
  toneSelected: { borderColor: colors.foreground },
  toneDot: { borderRadius: radii.full, height: 17, width: 17 },
  iconButton: { alignItems: 'center', height: 30, justifyContent: 'center', width: 30 },
  confirmButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.full, height: 30, justifyContent: 'center', width: 30 },
  disabled: { opacity: 0.4 },
});
