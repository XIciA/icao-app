import { GuideAnchor } from '@/features/usage-guide/GuideBindings';
import { trackProductClick } from '@/platform/product-clicks.native';
import { Check, Highlighter, Pencil, Search, Tags, Trash2, X } from '@/components/ui/icons';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
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
  onManagingChange?: (editing: boolean) => void;
  exitGuardRef?: { current: (() => Promise<boolean>) | undefined };
  onSaveDefinition?: (kind: CreatorKind, id: string | undefined, label: string, color: AnnotationToneKey) => Promise<boolean>;
  onDeleteDefinition?: (kind: CreatorKind, id: string) => Promise<boolean>;
  definitionUsage?: (kind: CreatorKind, id: string) => number;
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
          <GuideAnchor id="sentence-highlight-tool" /><Highlighter color={highlightMode ? colors.primary : colors.mutedForeground} size={14} />
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
          <GuideAnchor id="sentence-tag-tool" /><Tags color={tagMode ? colors.primary : colors.mutedForeground} size={14} />
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

function AnnotationFloatingPanelContent({ activeHighlightId, highlightDefinitions, left, mode,
  onHighlightChange, onTagToggle, selectedTags, tagDefinitions, top, width,
  onManagingChange, onSaveDefinition, onDeleteDefinition, definitionUsage, exitGuardRef,
}: Omit<FloatingPanelProps, 'mode'> & { mode: FloatingMode }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string>();
  const [tone, setTone] = useState<AnnotationToneKey>('green');
  const [pendingTone, setPendingTone] = useState<AnnotationToneKey>();
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pendingExit = useRef<Promise<boolean> | undefined>(undefined);
  const kind: CreatorKind = mode === 'tags' ? 'tag' : 'highlight';
  const definitions = mode === 'tags' ? tagDefinitions : highlightDefinitions;
  const definition = editingId ? definitions.find((entry) => entry.id === editingId) : undefined;
  const dirty = name.trim() !== (definition?.label ?? '');
  useEffect(() => { onManagingChange?.(editing); return () => onManagingChange?.(false); }, [editing, onManagingChange]);
  useEffect(() => {
    if (!exitGuardRef) return;
    exitGuardRef.current = () => {
      if (busy) return Promise.resolve(false);
      if (!editing) return Promise.resolve(true);
      if (!dirty) { setEditing(false); return Promise.resolve(true); }
      if (!pendingExit.current) {
        pendingExit.current = new Promise<boolean>((resolve) => {
          Alert.alert('放弃未保存的修改？', '当前分类名称尚未保存。可以继续编辑，或放弃修改后离开。', [
            { text: '继续编辑', style: 'cancel', onPress: () => resolve(false) },
            { text: '放弃修改', style: 'destructive', onPress: () => { setEditing(false); resolve(true); } },
          ], { cancelable: true, onDismiss: () => resolve(false) });
        }).finally(() => { pendingExit.current = undefined; });
      }
      return pendingExit.current;
    };
    return () => { exitGuardRef.current = undefined; };
  }, [busy, dirty, editing, exitGuardRef]);
  function selectTone(next: AnnotationToneKey) {
    const selected = definitions.find((entry) => entry.color === next);
    setTone(next); setName(selected?.label ?? ''); setEditingId(selected?.id);
    setError(''); setDeleting(false); setPendingTone(undefined);
  }
  function changeTone(next: AnnotationToneKey) {
    if (busy || tone === next) return;
    if (dirty) setPendingTone(next); else selectTone(next);
  }
  function enter() {
    if (editing) return;
    selectTone(definitions.find((entry) => entry.id === activeHighlightId)?.color ?? definitions[0]?.color ?? 'green');
    setEditing(true);
  }
  function close() { if (!busy) { setEditing(false); setDeleting(false); setPendingTone(undefined); setError(''); } }
  async function save() {
    if (busy || !name.trim()) return;
    if (editingId && !definition) { setError('此分类已被其他设备删除，请取消后重新选择。'); return; }
    if (!dirty && definition) { close(); return; }
    setBusy(true); setError('');
    try {
      if (!await onSaveDefinition?.(kind, definition?.id, name, tone)) { setError('保存未完成，请重试；每种颜色只能有一个名称。'); return; }
      setEditing(false);
    } catch { setError('保存失败，请重试。'); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (busy || !definition) return;
    setBusy(true); setError('');
    try {
      if (!await onDeleteDefinition?.(kind, definition.id)) { setError('删除未完成，请重试。'); return; }
      setEditing(false); setDeleting(false);
    } catch { setError('删除失败，请重试。'); }
    finally { setBusy(false); }
  }
  return <View pointerEvents="box-none" style={styles.floatingLayer} testID="annotation-floating-layer">
    <View style={[styles.picker, { left, top, width }]} testID={mode === 'highlight' ? 'highlight-color-panel' : 'annotation-picker-panel'}>
      <ToolOptions definitions={definitions} onCreate={enter}
        onSelect={(id) => { if (busy) return; const selected = definitions.find((entry) => entry.id === id); if (editing) { if (selected) { if (dirty) { setError('请先保存或取消当前修改。'); return; } setTone(selected.color); setName(selected.label); setEditingId(selected.id); setDeleting(false); setError(''); } } else if (mode === 'tags') onTagToggle(id); else onHighlightChange(id); }}
        selectedIds={editing ? definition ? [definition.id] : [] : mode === 'tags' ? selectedTags : [activeHighlightId]}
        singleSelection={mode === 'highlight'} managing={editing} />
      {!editing && mode === 'highlight' && !definitions.some((entry) => entry.id === activeHighlightId) ? <AppText variant="caption">请选择高亮颜色，再标记正文。</AppText> : null}
      {editing ? <View style={styles.creator}>
        <AppText variant="micro">{kind === 'tag' ? '管理标签' : '管理高亮'} · {definition ? '修改当前颜色名称' : '选择的颜色尚未使用，填写名称即可新增'}</AppText>
        {new Set(definitions.map((entry) => entry.color)).size < definitions.length ? <AppText variant="caption">历史分类超过可用颜色，已保留全部标记。请先删除不再需要的分类，释放颜色后会自动整理；删除前会显示影响范围。</AppText> : null}
        <TextInput accessibilityLabel="标注名称" autoFocus editable={!busy} maxLength={8} onChangeText={setName}
          onSubmitEditing={() => { void save(); }} placeholder="名称" placeholderTextColor={colors.mutedForeground} style={styles.input} value={name} />
        <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
          <View style={styles.tones}>{(Object.keys(annotationToneColors) as AnnotationToneKey[]).map((key) => <Pressable
            accessibilityLabel={`颜色 ${key}${definitions.some((entry) => entry.color === key) ? ' 已使用' : ' 未使用'}`} accessibilityState={{ selected: tone === key }} disabled={busy}
            key={key} onPress={() => changeTone(key)} style={[styles.toneButton, tone === key ? styles.toneSelected : null]}>
            <View style={[styles.toneDot, { backgroundColor: annotationToneColors[key] }]} />
          </Pressable>)}</View>
        </ScrollView>
        {pendingTone ? <View style={{ gap: spacing[2] }}><AppText variant="caption">切换颜色会放弃未保存的名称修改。</AppText><Button size="sm" onPress={() => selectTone(pendingTone)}>放弃修改并切换</Button><Button size="sm" variant="outline" onPress={() => setPendingTone(undefined)}>继续编辑</Button></View> : null}
        {deleting && definition ? <View style={{ gap: spacing[2] }}><AppText variant="caption">删除“{definition.label}”及其在 {definitionUsage?.(kind, definition.id) ?? 0} 道题上的{kind === 'tag' ? '标签' : '高亮'}？其他标记和笔记保留。</AppText><Button size="sm" disabled={busy} onPress={() => { void remove(); }}>确认删除</Button><Button size="sm" disabled={busy} variant="outline" onPress={() => setDeleting(false)}>取消删除</Button></View> : null}
        {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
        <View style={styles.creatorFooter}>
          {definition ? <Pressable accessibilityLabel="删除当前分类" disabled={busy} onPress={() => setDeleting(true)} style={styles.iconButton}><Trash2 color={colors.destructive} size={18} /></Pressable> : null}
          <View style={{ flex: 1 }} />
          <Pressable accessibilityLabel="取消编辑标注" disabled={busy} onPress={close} style={styles.iconButton}><X color={colors.mutedForeground} size={18} /></Pressable>
          <Pressable accessibilityLabel={dirty || !definition ? '保存标注' : '完成标注管理'} disabled={busy || !name.trim()} onPress={() => { void save(); }} style={[styles.confirmButton, busy || !name.trim() ? styles.disabled : null]}><Check color={colors.primaryForeground} size={18} /></Pressable>
        </View>
      </View> : null}
    </View>
  </View>;
}

function ToolOptions({ definitions, onCreate, onSelect, selectedIds, singleSelection, managing = false }: {
  definitions: AnnotationDefinition[];
  onCreate: () => void;
  onSelect: (id: string) => void;
  selectedIds: string[];
  singleSelection: boolean;
  managing?: boolean;
}) {
  return (
    <View style={styles.optionsRow}>{!singleSelection ? <GuideAnchor id="sentence-tag-tool" /> : null}
      <ScrollView style={styles.optionsScroll} contentContainerStyle={styles.options} horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} testID="annotation-options-scroll">
        {definitions.map((definition) => {
          const selected = selectedIds.includes(definition.id);
          return (
            <Pressable
              accessibilityLabel={managing ? `编辑${definition.label}` : singleSelection ? `使用${definition.label}高亮` : `${selected ? '取消选择' : '选择'}${definition.label}`}
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
      </ScrollView>
      <Pressable accessibilityLabel="管理标注分类" accessibilityRole="button" onPress={onCreate} style={styles.addButton}>
        <Pencil color={colors.mutedForeground} size={15} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  tool: { alignItems: 'center', backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], minHeight: 30, paddingHorizontal: spacing[3] },
  toolActive: { backgroundColor: colors.primary06, borderColor: colors.primary },
  floatingLayer: { ...StyleSheet.absoluteFillObject, zIndex: 40 },
  picker: { backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.xl, borderWidth: 1, gap: spacing[2], padding: spacing[2.5], position: 'absolute', ...shadows.modal },
  optionsRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[2], minWidth: 0 },
  optionsScroll: { flex: 1, minWidth: 0 },
  options: { flexDirection: 'row', gap: spacing[2], paddingRight: spacing[1] },
  pill: { alignItems: 'center', flexShrink: 0, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], minHeight: 32, paddingHorizontal: spacing[2.5] },
  pillSelected: { backgroundColor: colors.primary06, borderColor: colors.primary },
  dot: { borderRadius: radii.full, height: 8, width: 8 },
  addButton: { alignItems: 'center', flexShrink: 0, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 },
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
