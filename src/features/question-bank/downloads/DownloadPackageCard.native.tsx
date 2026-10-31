import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { AppText } from '@/components/ui';
import { Check, ChevronDown, ChevronUp, Trash2, type LucideIcon } from '@/components/ui/icons';
import { colors } from '@/theme';
import { fonts } from '@/theme/font-families';

type Props = {
  title: string; icon: ReactNode; open: boolean; toggle(): void;
  status: string; completed: boolean; progress: number; size: string;
  scope: string; scopes: { value: string; label: string; shortLabel: string }[];
  rangeLocked: boolean; onScope(value: string): void;
  action: LucideIcon; actionLabel: string; actionDisabled?: boolean; onAction(): void;
  canDelete: boolean; onDelete(): void;
};
/** One measured template for question banks and vocabulary packages. */
export function DownloadPackageCard(props: Props) {
  const { width, height: viewportHeight, fontScale } = useWindowDimensions();
  const anchor = useRef<View>(null);
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  const selected = props.scopes.find(item => item.value === props.scope)!;
  const neutral = ['未下载', '下载中', '校验中', '等待下载', '等待中'].includes(props.status);
  const Action = props.action;
  const small = width < 360;
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: props.open }} onPress={props.toggle} style={[styles.heading, small && styles.smallHeading]}>
      <View style={styles.icon}>{props.icon}</View><AppText variant="cardTitle" style={styles.title}>{props.title}</AppText>
      <View style={[styles.badge, { backgroundColor: props.status === '已下载' ? '#E0F5E9' : neutral ? colors.secondary : '#FBE7E7' }]}><AppText variant="micro" style={styles.status} accessibilityLiveRegion="polite">{props.status}</AppText></View>
      {props.open ? <ChevronUp size={17} strokeWidth={1.7} color={colors.foreground} /> : <ChevronDown size={17} strokeWidth={1.7} color={colors.foreground} />}
    </Pressable>
    {props.open ? <View style={styles.body}>
      <ScrollView horizontal scrollEnabled={fontScale > 1.2} showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.row, { gap: small ? 4 : 8, minWidth: fontScale > 1.2 ? 310 * fontScale : undefined }]}>
        <Pressable ref={anchor} accessibilityRole="button" accessibilityLabel={`选择下载范围：${selected.label}`} disabled={props.rangeLocked} onPress={event => {
          const point = event?.nativeEvent;
          const bottom = viewportHeight - props.scopes.length * 44 - 24;
          setMenu({ x: point ? point.pageX - point.locationX : 16, y: Math.min(point ? point.pageY - point.locationY + 44 : 150, bottom) });
          anchor.current?.measureInWindow((x, y, _width, height) => setMenu({ x, y: Math.min(y + height, bottom) }));
        }} style={[styles.scope, fontScale > 1.2 && { width: 46 * fontScale }]}><AppText variant="micro" style={styles.small}>{selected.shortLabel}</AppText><ChevronDown size={12} strokeWidth={1.7} color={colors.foreground} /></Pressable>
        <View accessibilityRole="progressbar" accessibilityLabel={props.completed ? '下载完成' : '下载进度'} accessibilityValue={{ min: 0, max: 100, now: props.progress }} style={styles.ring}>
          <Svg width={38} height={38} style={StyleSheet.absoluteFill}><Circle cx={19} cy={19} r={18} stroke={colors.secondary} strokeWidth={2} fill="none" /><Circle cx={19} cy={19} r={18} stroke={colors.foreground} strokeWidth={2} fill="none" strokeDasharray={`${2 * Math.PI * 18}`} strokeDashoffset={2 * Math.PI * 18 * (1 - props.progress / 100)} rotation={-90} origin="19, 19" /></Svg>
          {props.completed ? <Check size={17} strokeWidth={1.7} color={colors.foreground} /> : <AppText variant="micro" style={styles.small} maxFontSizeMultiplier={1.15}>{props.progress}%</AppText>}
        </View>
        <AppText variant="micro" style={[styles.small, styles.size]}>{props.size}</AppText>
        <View style={styles.actions}>
          {props.completed ? <View style={styles.action} /> : <Pressable accessibilityRole="button" accessibilityLabel={props.actionLabel} disabled={props.actionDisabled} onPress={props.onAction} style={[styles.action, props.actionDisabled && styles.disabled]}><Action size={20} strokeWidth={1.7} color={colors.foreground} /></Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel="删除下载" disabled={!props.canDelete} onPress={props.onDelete} style={[styles.action, !props.canDelete && styles.disabled]}><Trash2 size={20} strokeWidth={1.7} color={colors.foreground} /></Pressable>
        </View>
      </ScrollView>
    </View> : null}
    <Modal visible={Boolean(menu) && props.open && !props.rangeLocked} transparent animationType="none" onRequestClose={() => setMenu(undefined)}>
      <Pressable accessibilityLabel="关闭范围选择" style={StyleSheet.absoluteFill} onPress={() => setMenu(undefined)} />
      <View style={[styles.menu, { left: Math.min(menu?.x ?? 0, width - 190), top: menu?.y ?? 0 }]}>
        {props.scopes.map(item => <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: props.scope === item.value }} onPress={() => { props.onScope(item.value); setMenu(undefined); }} style={[styles.option, props.scope === item.value && { backgroundColor: colors.secondary }]}><AppText variant="micro" style={styles.small}>{item.label}</AppText>{props.scope === item.value ? <Check size={16} color={colors.foreground} /> : null}</Pressable>)}
      </View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 22, marginBottom: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 74 }, smallHeading: { gap: 8, padding: 12 },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondary, borderRadius: 16 },
  title: { flex: 1, fontSize: 20, lineHeight: 26 }, badge: { borderRadius: 10, paddingVertical: 4, paddingHorizontal: 7 },
  status: { fontFamily: fonts.sansRegular, fontSize: 12, lineHeight: 17, color: colors.foreground },
  small: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 19, color: colors.foreground },
  body: { paddingHorizontal: 14, paddingBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, flexGrow: 1 },
  scope: { width: 46, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2 },
  ring: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }, size: { flex: 1, textAlign: 'center' },
  actions: { flexDirection: 'row', width: 88 }, action: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.22 },
  menu: { position: 'absolute', minWidth: 175, backgroundColor: colors.card, borderRadius: 13, borderWidth: 1, borderColor: colors.border, padding: 4, shadowColor: colors.foreground, shadowOpacity: 0.09, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  option: { minHeight: 44, paddingHorizontal: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
});
