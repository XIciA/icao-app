import { trackProductClick } from '@/platform/product-clicks.native';
import { Check, Highlighter, Plus, Search, Tags, X } from '@/components/ui/icons';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, radii, shadows, spacing } from '@/theme';

import { annotationToneColors } from '../annotations/colors';
import type { AnnotationDefinition, AnnotationToneKey } from '../annotations/types';

type CreatorKind = 'tag' | 'highlight';
type FloatingMode = 'highlight' | 'tags';

type ToolbarProps = {
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
  onTagModeChange?: (value: boolean) => void;
  onTagToggle: (id: string) => void;
  resetToken: string | number;
  selectedTags: string[];
  showDictionary: boolean;
  showHighlights: boolean;
  showTags: boolean;
  tagDefinitions: AnnotationDefinition[];
  tagMode?: boolean;
};

type FloatingPanelProps = {
  activeHighlightId: string;
  highlightDefinitions: AnnotationDefinition[];
  left: number;
  mode?: FloatingMode;
  onCreateHighlight: (label: string, color: AnnotationToneKey) => void;
  onCreateTag: (label: string, color: AnnotationToneKey) => void;
  onHighlightChange: (id: string) => void;
  onTagToggle: (id: string) => void;
  resetToken: string | number;
  selectedTags: string[];
  tagDefinitions: AnnotationDefinition[];
  top: number;
  width: number;
};

export function AnnotationToolbar({
  dictionaryMode,
  highlightMode,
  leading,
  onDictionaryModeChange,
  onHighlightModeChange,
  onTagModeChange,
  showDictionary,
  showHighlights,
  showTags,
  tagMode = false,
}: ToolbarProps) {
  function toggleDictionary() {
    if (dictionaryMode) {
      onDictionaryModeChange(false);
      return;
    }
    if (highlightMode) onHighlightModeChange(false);
    if (tagMode) onTagModeChange?.(false);
    onDictionaryModeChange(true);
  }

  function toggleHighlightMode() {
    if (highlightMode) {
      onHighlightModeChange(false);
      return;
    }
    if (dictionaryMode) onDictionaryModeChange(false);
    if (tagMode) onTagModeChange?.(false);
    onHighlightModeChange(true);
  }

  function toggleTags() {
    if (tagMode) {
      onTagModeChange?.(false);
      return;
    }
    if (dictionaryMode) onDictionaryModeChange(false);
    if (highlightMode) onHighlightModeChange(false);
    onTagModeChange?.(true);
  }

  return (
    <View style={styles.toolbar} testID="annotation-toolbar">
      {leading}
      {showDictionary ? (
        <Pressable
          accessibilityLabel={dictionaryMode ? '关闭查词模式' : '开启查词模式'}
          accessibilityState={{ selected: dictionaryMode }}
          onPress={toggleDictionary}
          style={[styles.tool, dictionaryMode ? styles.toolActive : null]}
        >
          <Search color={dictionaryMode ? colors.primary : colors.mutedForeground} size={14} />
          <AppText color={dictionaryMode ? colors.primary : colors.mutedForeground} variant="caption">查词</AppText>
        </Pressable>
      ) : null}
      {showHighlights ? (
        <Pressable
          accessibilityLabel={highlightMode ? '关闭高亮模式' : '开启高亮模式'}
          accessibilityState={{ expanded: highlightMode, selected: highlightMode }}
          onPress={() => { trackProductClick('highlight'); toggleHighlightMode(); }}
          style={[styles.tool, highlightMode ? styles.toolActive : null]}
        >
          <Highlighter color={highlightMode ? colors.primary : colors.mutedForeground} size={14} />
          <AppText color={highlightMode ? colors.primary : colors.mutedForeground} variant="caption">高亮</AppText>
        </Pressable>
      ) : null}
      {showTags ? (
        <Pressable
          accessibilityLabel={tagMode ? '关闭标签模式' : '开启标签模式'}
          accessibilityState={{ expanded: tagMode, selected: tagMode }}
          onPress={() => { trackProductClick('tag'); toggleTags(); }}
          style={[styles.tool, tagMode ? styles.toolActive : null]}
        >
          <Tags color={tagMode ? colors.primary : colors.mutedForeground} size={14} />
          <AppText color={tagMode ? colors.primary : colors.mutedForeground} variant="caption">标签</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function AnnotationFloatingPanel(props: FloatingPanelProps) {
  if (!props.mode) return null;
  return <AnnotationFloatingPanelContent key={`${props.mode}:${props.resetToken}`} {...props} mode={props.mode} />;
}

function AnnotationFloatingPanelContent({
  activeHighlightId,
  highlightDefinitions,
  left,
  mode,
  onCreateHighlight,
  onCreateTag,
  onHighlightChange,
  onTagToggle,
  selectedTags,
  tagDefinitions,
  top,
  width,
}: Omit<FloatingPanelProps, 'mode'> & { mode: FloatingMode }) {
  const [creator, setCreator] = useState<CreatorKind>();
  const [name, setName] = useState('');
  const [tone, setTone] = useState<AnnotationToneKey>('green');

  const creatorKind: CreatorKind = mode === 'tags' ? 'tag' : 'highlight';
  const definitions = mode === 'tags' ? tagDefinitions : highlightDefinitions;
  const selectedIds = mode === 'tags' ? selectedTags : [activeHighlightId];

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

  return (
    <View pointerEvents="box-none" style={styles.floatingLayer} testID="annotation-floating-layer">
      <View
        style={[styles.picker, { left, top, width }]}
        testID={mode === 'highlight' ? 'highlight-color-panel' : 'annotation-picker-panel'}
      >
        <ToolOptions
          definitions={definitions}
          onCreate={() => setCreator(creatorKind)}
          onSelect={mode === 'tags' ? onTagToggle : onHighlightChange}
          selectedIds={selectedIds}
          singleSelection={mode === 'highlight'}
        />
        {creator === creatorKind ? (
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
                  <Pressable
                    accessibilityLabel={`颜色 ${key}`}
                    key={key}
                    onPress={() => setTone(key)}
                    style={[styles.toneButton, tone === key ? styles.toneSelected : null]}
                  >
                    <View style={[styles.toneDot, { backgroundColor: annotationToneColors[key] }]} />
                  </Pressable>
                ))}
              </View>
              <Pressable accessibilityLabel="取消新建" onPress={closeCreator} style={styles.iconButton}>
                <X color={colors.mutedForeground} size={15} />
              </Pressable>
              <Pressable
                accessibilityLabel="确认新建"
                disabled={!name.trim()}
                onPress={submitCreator}
                style={[styles.confirmButton, !name.trim() ? styles.disabled : null]}
              >
                <Check color={colors.primaryForeground} size={15} />
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
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
            accessibilityState={{ selected }}
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
      <Pressable accessibilityLabel="新建标注定义" onPress={onCreate} style={styles.addButton}>
        <Plus color={colors.mutedForeground} size={15} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  tool: { alignItems: 'center', backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], minHeight: 30, paddingHorizontal: spacing[3] },
  toolActive: { backgroundColor: colors.primary06, borderColor: colors.primary },
  floatingLayer: { ...StyleSheet.absoluteFillObject, zIndex: 40 },
  picker: { backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.xl, borderWidth: 1, gap: spacing[2], padding: spacing[2.5], position: 'absolute', ...shadows.modal },
  options: { flexDirection: 'row', gap: spacing[2], paddingRight: spacing[1] },
  pill: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], minHeight: 32, paddingHorizontal: spacing[2.5] },
  pillSelected: { backgroundColor: colors.primary06, borderColor: colors.primary },
  dot: { borderRadius: radii.full, height: 8, width: 8 },
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
