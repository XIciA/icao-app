import {
  BookOpenText,
  Check,
  ChevronsUpDown,
  GraduationCap,
  Headphones,
  MessageSquareQuote,
  Mic2,
  RadioTower,
  UserRound,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabPlaceholderScreen } from '@/components/screens/TabPlaceholderScreen';
import { AppText } from '@/components/ui';
import { colors, fonts, radii, shadows, spacing } from '@/theme';

const entries = [
  {
    slug: 'listening',
    title: '听力',
    description: '理解能力',
    meta: '4 题组 / 631 题',
    icon: Headphones,
  },
  {
    slug: 'sentences900',
    title: '900 句',
    description: '发音 结构 流利度',
    meta: '3 等级 / 900 句',
    icon: MessageSquareQuote,
  },
  {
    slug: 'radiotelephony',
    title: '陆空通话',
    description: '结构 词汇 理解能力',
    meta: '107 场景 / 1851 卡',
    icon: RadioTower,
  },
  {
    slug: 'opi',
    title: 'OPI',
    description: '发音 结构 词汇 流利度 理解能力 应对能力',
    meta: '121 话题 / 1269 卡',
    icon: Mic2,
  },
  {
    slug: 'storytelling',
    title: '故事复诵',
    description: '发音 结构 词汇 流利度 理解能力',
    meta: '4 子库 / 296 卡',
    icon: BookOpenText,
  },
];

type Course = {
  id: string;
  label: string;
  description: string;
  modules: string[];
};

const courses: Course[] = [
  {
    id: 'icao4-retake',
    label: 'ICAO 4 复考',
    description: '聚焦陆空通话与口试冲刺',
    modules: ['radiotelephony', 'opi'],
  },
  {
    id: 'icao4-first',
    label: 'ICAO 4 首考',
    description: '系统备考四大核心模块',
    modules: ['listening', 'sentences900', 'radiotelephony', 'opi'],
  },
  {
    id: 'icao5-first',
    label: 'ICAO 5 首考',
    description: '全模块进阶，冲击 5 级',
    modules: ['listening', 'sentences900', 'radiotelephony', 'opi', 'storytelling'],
  },
];

export default function QuestionBankTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [courseId, setCourseId] = useState('icao4-first');
  const [pickerOpen, setPickerOpen] = useState(false);
  const course = courses.find((item) => item.id === courseId) ?? courses[1];
  const visibleEntries = entries.filter((entry) => course.modules.includes(entry.slug));

  return (
    <>
      <TabPlaceholderScreen
        entries={visibleEntries}
        headerLeading={
          <Pressable
            accessibilityLabel="打开个人资料"
            accessibilityRole="button"
            onPress={() => router.push('/account/profile')}
            style={({ pressed }) => [styles.profileButton, pressed ? styles.pressed : null]}
          >
            <UserRound color={colors.mutedForeground} size={20} />
          </Pressable>
        }
        headerTrailing={
          <Pressable
            accessibilityLabel="选择备考课程"
            accessibilityRole="button"
            accessibilityState={{ expanded: pickerOpen }}
            onPress={() => setPickerOpen(true)}
            style={({ pressed }) => [styles.courseButton, pressed ? styles.pressed : null]}
          >
            <GraduationCap color={colors.primary} size={14} />
            <AppText style={styles.courseLabel}>{course.label}</AppText>
            <ChevronsUpDown color={colors.mutedForeground} size={14} />
          </Pressable>
        }
        onEntryPress={(entry) => {
          router.push({ pathname: '/question-bank/[bankId]', params: { bankId: entry.slug } });
        }}
        subtitle="跟着课程计划，逐个攻克核心模块。"
        title="稳步进阶，冲刺目标等级"
      />

      <Modal animationType="fade" onRequestClose={() => setPickerOpen(false)} transparent visible={pickerOpen}>
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityLabel="关闭课程选择"
            onPress={() => setPickerOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[styles.courseMenu, { top: insets.top + 48 }]}
          >
            {courses.map((item) => {
              const selected = item.id === courseId;
              return (
                <Pressable
                  accessibilityLabel={`选择${item.label}`}
                  accessibilityRole="button"
                  key={item.id}
                  onPress={() => {
                    setCourseId(item.id);
                    setPickerOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.courseOption,
                    selected ? styles.courseOptionSelected : null,
                    pressed ? styles.optionPressed : null,
                  ]}
                >
                  <View style={styles.optionCopy}>
                    <AppText color={selected ? colors.primary : colors.foreground} style={styles.optionTitle}>
                      {item.label}
                    </AppText>
                    <AppText numberOfLines={1} variant="caption">{item.description}</AppText>
                  </View>
                  {selected ? <Check color={colors.primary} size={17} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  profileButton: {
    alignItems: 'center',
    backgroundColor: colors.secondary,
    borderColor: colors.border,
    borderRadius: radii.full,
    borderTopColor: 'rgba(255,255,255,0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  courseButton: {
    alignItems: 'center',
    backgroundColor: colors.card80,
    borderColor: colors.primary20,
    borderRadius: radii.full,
    borderTopColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[1.5],
    minHeight: 32,
    paddingLeft: spacing[3],
    paddingRight: spacing[2],
    ...shadows.card,
  },
  courseLabel: {
    color: colors.foreground,
    fontFamily: fonts.serifSemibold,
    fontSize: 12,
    lineHeight: 18,
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  modalBackdrop: { flex: 1 },
  courseMenu: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radii.xl,
    borderTopColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    overflow: 'hidden',
    position: 'absolute',
    right: spacing[5],
    width: 256,
    ...shadows.modal,
  },
  courseOption: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 64,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  courseOptionSelected: { backgroundColor: colors.primary06 },
  optionPressed: { backgroundColor: colors.secondary },
  optionCopy: { flex: 1, minWidth: 0 },
  optionTitle: {
    fontFamily: fonts.serifSemibold,
    fontSize: 16,
    lineHeight: 23,
  },
});
