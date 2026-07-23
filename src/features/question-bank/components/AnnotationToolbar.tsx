import { Check, Highlighter, Plus, Search, Tags, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppModal } from '@/components/platform/AppModal';
import { useAppViewportDimensions } from '@/components/platform/useAppViewportDimensions';
import { AppText } from '@/components/ui';
import { colors, radii, shadows, spacing } from '@/theme';

import { annotationToneColors } from '../annotations/colors';
import type { AnnotationDefinition, AnnotationToneKey } from '../annotations/types';

type CreatorKind = 'tag' | 'highlight';
type PickerKind = 'tag';

export function AnnotationToolbar({
  activeHighlightId,
  dictionaryMode,
  highlightDefinitions,
  highlightMode,
  leading,
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
  leading?: ReactNode;
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
  const { width: windowWidth } = useAppViewportDimensions();
  const toolbarRef = useRef<View>(null);
  const [picker, setPicker] = useState<PickerKind>();
  const [pickerTop, setPickerTop] = useState<number>(spacing[20]);
  const [creator, setCreator] = useState<CreatorKind>();
  const [name, setName] = useState('');
  const [tone, setTone] = useState<AnnotationToneKey>('green');
  const pickerWidth = Math.min(windowWidth - spacing[10], 390);
  const pickerLeft = Math.max(spacing[5], (windowWidth - pickerWidth) / 2);

  useEffect(() => {
    setPicker(undefined);
    setCreator(undefined);
    setName('');
  }, [resetToken]);

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
      setPicker(undefined);
      closeCreator();
      onHighlightModeChange(false);
      return;
    }
    setPicker(undefined);
    closeCreator();
    onDictionaryModeChange(false);
    onHighlightModeChange(true);
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

  const visibleTagCreator = creator === 'tag' && picker === 'tag';
  const visibleHighlightCreator = creator === 'highlight' && highlightMode;

  const creatorForm = (visibleTagCreator || visibleHighlightCreator) ? (
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
  ) : null;

  return (
    <View style={styles.root}>
      <View collapsable={false} onLayout={measurePickerTop} ref={toolbarRef} style={styles.toolbar}>
        {leading}
        {showDictionary ? (
          <Pressable accessibilityLabel={dictionaryMode ? '关闭查词模式' : '开启查词模式'} onPress={toggleDictionary} style={[styles.tool, dictionaryMode ? styles.toolActive : null]}>
            <Search color={dictionaryMode ? colors.primary : colors.mutedForeground} size={14} />
            <AppText color={dictionaryMode ? colors.primary : colors.mutedForeground} variant="caption">查词</AppText>
          </Pressable>
        ) : null}
        {showHighlights ? (
          <Pressable accessibilityLabel={highlightMode ? '关闭高亮模式' : '开启高亮模式'} accessibilityState={{ expanded: highlightMode, selected: highlightMode }} onPress={toggleHighlightMode} style={[styles.tool, highlightMode ? styles.toolActive : null]}>
            <Highlighter color={highlightMode ? colors.primary : colors.mutedForeground} size={14} />
            <AppText color={highlightMode ? colors.primary : colors.mutedForeground} variant="caption">高亮</AppText>
          </Pressable>
        ) : null}
        {showTags ? (
          <Pressable accessibilityLabel={picker === 'tag' ? '关闭标签面板' : '打开标签面板'} accessibilityState={{ expanded: picker === 'tag' }} onPress={toggleTags} style={[styles.tool, picker === 'tag' || selectedTags.length ? styles.toolActive : null]}>
            <Tags color={picker === 'tag' || selectedTags.length ? colors.primary : colors.mutedForeground} size={14} />
            <AppText color={picker === 'tag' || selectedTags.length ? colors.primary : colors.mutedForeground} variant="caption">标签</AppText>
          </Pressable>
        ) : null}
      </View>

      {showHighlights && highlightMode ? (
        <View style={styles.highlightPanel} testID="highlight-color-panel">
          <ToolOptions
            definitions={highlightDefinitions}
            onCreate={() => setCreator('highlight')}
            onSelect={onHighlightChange}
            singleSelection
            selectedIds={[activeHighlightId]}
          />
          {visibleHighlightCreator ? creatorForm : null}
        </View>
      ) : null}

      <AppModal animationType="fade" onRequestClose={closePicker} transparent visible={Boolean(picker)}>
        <View style={styles.modalLayer}>
          <Pressable accessibilityLabel="关闭标注工具" onPress={closePicker} style={StyleSheet.absoluteFill} />
          <View style={[styles.picker, { left: pickerLeft, top: pickerTop, width: pickerWidth }]} testID="annotation-picker-panel">
            <ToolOptions
              definitions={tagDefinitions}
              onCreate={() => setCreator('tag')}
              onSelect={onTagToggle}
              singleSelection={false}
              selectedIds={selectedTags}
            />
            {visibleTagCreator ? creatorForm : null}
          </View>
        </View>
      </AppModal>
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
  root: { position: 'relative', width: '100%', zIndex: 30 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  highlightPanel: { backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.xl, borderWidth: 1, gap: spacing[2], marginTop: spacing[2], padding: spacing[2.5] },
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
});
