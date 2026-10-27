import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, BottomSheet, Button } from '@/components/ui';
import { CalendarDays, ChevronLeft, ChevronRight } from '@/components/ui/icons';
import { colors, radii, spacing } from '@/theme';

const calendarDate = (year: number, month: number, day = 1) => {
  const result = new Date(0);
  result.setFullYear(year, month, day);
  result.setHours(12, 0, 0, 0);
  return result;
};
const dayString = (year: number, month: number, day: number) => `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export function FeedbackDateField({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [month, setMonth] = useState(() => new Date());
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const offset = (calendarDate(year, monthIndex).getDay() + 6) % 7;
  const days = calendarDate(year, monthIndex + 1, 0).getDate();
  function show() {
    setDraft(value);
    const [selectedYear, selectedMonth] = value.split('-').map(Number);
    setMonth(value ? calendarDate(selectedYear!, selectedMonth! - 1) : new Date());
    setOpen(true);
  }
  return <View style={styles.group}>
    <AppText variant="button">考试时间</AppText>
    <Pressable accessibilityRole="button" accessibilityLabel="考试时间" accessibilityValue={{ text: value || '未选择' }} disabled={disabled} onPress={show} style={styles.field}>
      <AppText style={styles.value} color={value ? colors.foreground : colors.mutedForeground}>{value || '选择日期'}</AppText>
      <CalendarDays size={18} color={colors.mutedForeground} />
    </Pressable>
    <BottomSheet visible={open} onClose={() => setOpen(false)} accessibilityLabel="选择考试时间" footer={<View style={styles.actions}>
      <Button variant="ghost" onPress={() => { onChange(''); setOpen(false); }} disabled={disabled}>清空</Button>
      <Button variant="outline" onPress={() => setOpen(false)}>取消</Button>
      <Button disabled={!draft || disabled} onPress={() => { onChange(draft); setOpen(false); }}>确定</Button>
    </View>}>
      <View style={styles.heading}>
        <Pressable accessibilityRole="button" accessibilityLabel="上个月" disabled={year === 1 && monthIndex === 0} onPress={() => setMonth(calendarDate(year, monthIndex - 1))} style={styles.monthButton}><ChevronLeft size={22} color={colors.foreground} /></Pressable>
        <AppText variant="button">{year}年{monthIndex + 1}月</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="下个月" disabled={year === 9999 && monthIndex === 11} onPress={() => setMonth(calendarDate(year, monthIndex + 1))} style={styles.monthButton}><ChevronRight size={22} color={colors.foreground} /></Pressable>
      </View>
      <View style={styles.grid}>
        {['一', '二', '三', '四', '五', '六', '日'].map(day => <View key={day} style={styles.day}><AppText variant="caption">{day}</AppText></View>)}
        {Array.from({ length: offset }, (_, index) => <View key={`empty-${index}`} style={styles.day} />)}
        {Array.from({ length: days }, (_, index) => {
          const date = dayString(year, monthIndex, index + 1);
          const selected = draft === date;
          return <Pressable key={date} accessibilityRole="button" accessibilityLabel={date} accessibilityState={{ selected }} onPress={() => setDraft(date)} style={[styles.day, selected && styles.selected]}><AppText color={selected ? colors.primaryForeground : colors.foreground}>{index + 1}</AppText></Pressable>;
        })}
      </View>
    </BottomSheet>
  </View>;
}

const styles = StyleSheet.create({
  group: { gap: spacing[2] },
  field: { minHeight: 48, paddingHorizontal: spacing[3.5], borderWidth: 1, borderColor: colors.input, borderRadius: radii.md, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  value: { fontSize: 14 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[3] },
  monthButton: { padding: spacing[3] },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  day: { width: '14.285714%', minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm },
  selected: { backgroundColor: colors.primary },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[2] },
});
