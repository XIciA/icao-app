import { Check, Highlighter, Plus, Search, Tags, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, radii, shadows, spacing } from '@/theme';

import { annotationToneColors } from '../annotations/colors';
import type { AnnotationDefinition, AnnotationToneKey } from '../annotations/types';

type CreatorKind = 'tag' | 'highlight';
type PickerKind = CreatorKind;

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
  const { width: windowWidth } = useWindowDimensions();
  const toolbarRef = useRef<View>(null);
  const [picker, setPicker] = useState<PickerKind>();
  const [pickerTop, setPickerTop] = useState<number>(spacing[20]);
  const [creator, setCreator] = useState<CreatorKind>();
  const [name, setName] = useState('');
  const [tone, setTone] = useState<AnnotationToneKey>('green');
  const activeHighlight = useMemo(
    () => highlightDefinitions.find((definition) => definition.id === activeHighlightId) ?? highlightDefinitions[0],
    [activeHighlightId, highlightDefinitions],
  );
  const pickerWidth = Math.min(windowWidth - spacing[10], 390);
  const pickerLeft = Math.max(spacing[5], (windowWidth - pickerWidth) / 2);

  useEffect(() => {
    setPicker(undefined);
    setCreator(undefined);
    setName('');
  }, [resetToken]);

  useEffect(() => {
    if (!highlightMode && picker === 'highlight') setPicker(undefined);
  }, [highlightMode, picker]);

  function measurePickerTop() {
    toolbarRef.current?.measureInWindow((_x, y, _width, height) => {
      setPickerTop(y + height + spacing[2]);
    });
  }

  function openPicker(kind: PickerKind) {
    measurePickerTop();
    setPicker(kind);
  }

  function closePicker() {
    setPicker(undefined);
    closeCreator();
  }

  function closeCreator() {
    setCreator(undefined);
    setName('');
    setTone('green');
  }

  function submitCreator() {
    const label = name.trim();
    if (!label || !creator) return;
    const submittedKind = creator;
    if (submittedKind === 'tag') onCreateTag(label, tone);
    else onCreateHighlight(label, tone);
    closeCreator();
    if (submittedKind === 'highlight') setPicker(undefined);
  }

  function toggleDictionary() {
    const next = !dictionaryMode;
    setPicker(undefined);
    closeCreator();
    if (next) onHighlightModeChange(false);
    onDictionaryModeChange(next);
  }

  function toggleHighlightMode() {
    if (highlightMode) {
      if (picker === 'highlight') closePicker();
      else openPicker('highlight');
      return;
    }
    setPicker(undefined);
    closeCreator();
    onDictionaryModeChange(false);
    onHighlightModeChange(true);
    openPicker('highlight');
  }

  function toggleTags() {
    if (picker === 'tag') {
      closePicker();
      return;
    }
    closeCreator();
    onDictionaryModeChange(false);
    onHighlightModeChange(false);
    openPicker('tag');
  }

  function finishHighlightMode() {
    closePicker();
    onHighlightModeChange(false);
  }

  const visibleCreator = Boolean(creator && creator === picker);

  return (
    <View style={styles.root}>
      <View collapsable={false} onLayout={measurePickerTop} ref={toolbarRef} style={styles.toolbar}>
        {showDictionary ? (
          <Pressable accessibilityLabel={dictionaryMode ? '关闭查词模式' : '开启查词模式'} onPress={toggleDictionary} style={[styles.tool, dictionaryMode ? styles.toolActive : null]}>
            <Search color={dictionaryMode ? colors.primary : colors.mutedForeground} size={14} />
            <AppText color={dictionaryMode ? colors.primary : colors.mutedForeground} variant="caption">查词</AppText>
          </Pressable>
        ) : null}
        {showHighlights ? (
          <Pressable accessibilityLabel={highlightMode ? picker === 'highlight' ? '收起高亮颜色' : '打开高亮颜色' : '开启高亮模式'} accessibilityState={{ expanded: picker === 'highlight', selected: highlightMode }} onPress={toggleHighlightMode} style={[styles.tool, highlightMode ? styles.toolActive : null]}>
            <Highlighter color={highlightMode ? colors.primary : colors.mutedForeground} size={14} />
            <AppText color={highlightMode ? colors.primary : colors.mutedForeground} variant="caption">{highlightMode ? '高亮中' : '高亮'}</AppText>
          </Pressable>
        ) : null}
        {showTags ? (
          <Pressable accessibilityLabel={picker === 'tag' ? '关闭标签面板' : '打开标签面板'} accessibilityState={{ expanded: picker === 'tag' }} onPress={toggleTags} style={[styles.tool, picker === 'tag' || selectedTags.length ? styles.toolActive : null]}>
            <Tags color={picker === 'tag' || selectedTags.length ? colors.primary : colors.mutedForeground} size={14} />
            <AppText color={picker === 'tag' || selectedTags.length ? colors.primary : colors.mutedForeground} variant="caption">标签 {selectedTags.length}</AppText>
          </Pressable>
        ) : null}
      </View>

      {highlightMode && picker !== 'highlight' ? (
        <View style={styles.highlightStatus} testID="highlight-mode-status">
          <Pressable accessibilityLabel="调整高亮颜色" onPress={() => openPicker('highlight')} style={styles.highlightStatusMain}>
            <View style={[styles.statusDot, { backgroundColor: annotationToneColors[activeHighlight?.color ?? 'green'] }]} />
            <AppText color={colors.foreground} variant="micro">{activeHighlight?.label ?? '重点'}</AppText>
            <AppText color={colors.primary} variant="micro">高亮中</AppText>
          </Pressable>
          <View style={styles.statusDivider} />
          <Pressable accessibilityLabel="结束高亮模式" onPress={finishHighlightMode} style={styles.finishHighlight}>
            <Check color={colors.primary} size={12} />
            <AppText color={colors.primary} variant="micro">完成</AppText>
          </Pressable>
        </View>
      ) : null}

      <Modal animationType="fade" onRequestClose={closePicker} transparent visible={Boolean(picker)}>
        <View style={styles.modalLayer}>
          <Pressable accessibilityLabel="关闭标注工具" onPress={closePicker} style={StyleSheet.absoluteFill} />
          <View style={[styles.picker, { left: pickerLeft, top: pickerTop, width: pickerWidth }]} testID="annotation-picker-panel">
            {picker === 'highlight' ? <AppText color={colors.mutedForeground} variant="micro">轻点单词，或按住后拖动高亮</AppText> : null}
            <ToolOptions
              definitions={picker === 'tag' ? tagDefinitions : highlightDefinitions}
              onCreate={() => setCreator(picker)}
              onSelect={(id) => {
                if (picker === 'tag') onTagToggle(id);
                else {
                  onHighlightChange(id);
                  closePicker();
                }
              }}
              singleSelection={picker === 'highlight'}
              selectedIds={picker === 'tag' ? selectedTags : [activeHighlightId]}
            />
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
                    {(Object.keys(annotationToneColors) as AnnotationToneKey[]).map((key) => (
                      <Pressable accessibilityLabel={`颜色 ${key}`} key={key} onPress={() => setTone(key)} style={[styles.toneButton, tone === key ? styles.toneSelected : null]}>
                        <View style={[styles.toneDot, { backgroundColor: annotationToneColors[key] }]} />
                      </Pressable>
                    ))}
                  </View>
                  <Pressable accessibilityLabel="取消新建" onPress={closeCreator} style={styles.iconButton}><X color={colors.mutedForeground} size={15} /></Pressable>
                  <Pressable accessibilityLabel="确认新建" disabled={!name.trim()} onPress={submitCreator} style={[styles.confirmButton, !name.trim() ? styles.disabled : null]}><Check color={colors.primaryForeground} size={15} /></Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ToolOptions({ definitions, onCreate, onSelect, selectedIds, singleSelection }: {
  definitions: AnnotationDefinition[];
  onCreate: () => void;
  onSelect: (id: string) => void;
  selectedIds: string[];
  singleSelection: boolean;
}) {
  return (
    <ScrollView contentContainerStyle={styles.options} horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
        {definitions.map((definition) => {
          const selected = selectedIds.includes(definition.id);
          return (
            <Pressable
              accessibilityLabel={singleSelection ? `使用${definition.label}高亮` : `${selected ? '取消选择' : '选择'}${definition.label}`}
              key={definition.id}
              onPress={() => onSelect(definition.id)}
              style={[styles.pill, selected ? styles.pillSelected : null]}
            >
              <View style={[styles.dot, { backgroundColor: annotationToneColors[definition.color] }]} />
              <AppText color={selected ? colors.foreground : colors.mutedForeground} variant="micro">{definition.label}</AppText>
              {selected ? <Check color={colors.primary} size={12} /> : null}
            </Pressable>
          );
        })}
        <Pressable accessibilityLabel="新建标注定义" onPress={onCreate} style={styles.addButton}><Plus color={colors.mutedForeground} size={15} /></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, position: 'relative', zIndex: 30 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  modalLayer: { flex: 1 },
  picker: { backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.xl, borderWidth: 1, gap: spacing[2], padding: spacing[2.5], position: 'absolute', ...shadows.modal },
  options: { flexDirection: 'row', gap: spacing[2], paddingRight: spacing[1] },
  pill: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], minHeight: 32, paddingHorizontal: spacing[2.5] },
  pillSelected: { backgroundColor: colors.primary06, borderColor: colors.primary },
  dot: { borderRadius: radii.full, height: 8, width: 8 },
  tool: { alignItems: 'center', backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], minHeight: 30, paddingHorizontal: spacing[3] },
  toolActive: { backgroundColor: colors.primary06, borderColor: colors.primary },
  addButton: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 },
  creator: { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, gap: spacing[2], padding: spacing[2.5] },
  input: { backgroundColor: colors.card, borderColor: colors.input, borderRadius: radii.md, borderWidth: 1, color: colors.foreground, minHeight: 36, paddingHorizontal: spacing[3] },
  creatorFooter: { alignItems: 'center', flexDirection: 'row', gap: spacing[1.5] },
  tones: { flex: 1, flexDirection: 'row', gap: spacing[1.5] },
  toneButton: { alignItems: 'center', borderColor: 'transparent', borderRadius: radii.full, borderWidth: 2, height: 28, justifyContent: 'center', width: 28 },
  toneSelected: { borderColor: colors.foreground },
  toneDot: { borderRadius: radii.full, height: 17, width: 17 },
  iconButton: { alignItems: 'center', height: 30, justifyContent: 'center', width: 30 },
  confirmButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.full, height: 30, justifyContent: 'center', width: 30 },
  disabled: { opacity: 0.4 },
  highlightStatus: { alignItems: 'center', backgroundColor: colors.card80, borderColor: colors.primary20, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', left: 0, minHeight: 34, position: 'absolute', top: spacing[10], zIndex: 40, ...shadows.floating },
  highlightStatusMain: { alignItems: 'center', flexDirection: 'row', gap: spacing[1.5], minHeight: 34, paddingLeft: spacing[2.5], paddingRight: spacing[2] },
  statusDot: { borderRadius: radii.full, height: 8, width: 8 },
  statusDivider: { alignSelf: 'stretch', backgroundColor: colors.border, width: StyleSheet.hairlineWidth },
  finishHighlight: { alignItems: 'center', flexDirection: 'row', gap: spacing[1], minHeight: 34, paddingHorizontal: spacing[2.5] },
});
