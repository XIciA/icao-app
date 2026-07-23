import {
  ArrowRight,
  Check,
  GraduationCap,
  Info,
  Layers,
  MessageCircle,
  Plane,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, BottomSheet, Button, Card, Screen, Tag } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';

import {
  coursePromoCatalog,
  type CourseAdvantageIcon,
  type CourseCategory,
  type CourseMetricIcon,
  type CourseOutlineSection,
  type CoursePlan,
} from './course-promo-catalog';

type SectionId = 'advantages' | 'pricing' | 'contact';
type SectionPositions = Partial<Record<SectionId, number>>;

const metricIcons: Record<CourseMetricIcon, LucideIcon> = {
  trend: TrendingUp,
  layers: Layers,
  plane: Plane,
};

const advantageIcons: Record<CourseAdvantageIcon, LucideIcon> = {
  trend: TrendingUp,
  target: Target,
  users: Users,
  shield: ShieldCheck,
};

export function CourseCatalogScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const sectionPositions = useRef<SectionPositions>({});
  const [categoryId, setCategoryId] = useState<CourseCategory['id']>('summer');
  const [activePlan, setActivePlan] = useState<CoursePlan>();
  const category = useMemo(
    () => coursePromoCatalog.pricing.categories.find((item) => item.id === categoryId) ?? coursePromoCatalog.pricing.categories[0],
    [categoryId],
  );

  const scrollToSection = (section: SectionId) => {
    const y = sectionPositions.current[section];
    if (typeof y === 'number') scrollRef.current?.scrollTo({ animated: true, y: Math.max(0, y - spacing[3]) });
  };

  const consult = () => {
    setActivePlan(undefined);
    requestAnimationFrame(() => scrollToSection('contact'));
  };

  return (
    <Screen contentStyle={styles.screen}>
      <TopBar title="体系课程" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}><GraduationCap color={colors.primary} size={25} /></View>
          <AppText color={colors.primary} style={styles.eyebrow} variant="micro">{coursePromoCatalog.hero.eyebrow}</AppText>
          <AppText accessibilityRole="header" style={styles.heroTitle} variant="pageTitle">{coursePromoCatalog.hero.title}</AppText>
          <AppText style={styles.center}>{coursePromoCatalog.hero.description}</AppText>
          <View style={styles.heroActions}>
            <Button onPress={() => scrollToSection('pricing')} style={styles.heroAction}>{coursePromoCatalog.hero.primaryAction}</Button>
            <Button onPress={() => scrollToSection('advantages')} style={styles.heroAction} variant="secondary">{coursePromoCatalog.hero.secondaryAction}</Button>
          </View>
        </View>

        <View style={styles.metricList}>
          {coursePromoCatalog.metrics.map((metric) => {
            const Icon = metricIcons[metric.icon];
            return (
              <Card elevated key={metric.id} style={styles.metricCard}>
                <View style={styles.smallIcon}><Icon color={colors.primary} size={20} /></View>
                <View style={styles.metricCopy}>
                  <AppText style={styles.metricValue} variant="pageTitle">{metric.value}</AppText>
                  <AppText variant="caption">{metric.label}</AppText>
                </View>
              </Card>
            );
          })}
        </View>

        <View
          onLayout={({ nativeEvent }) => { sectionPositions.current.advantages = nativeEvent.layout.y; }}
          style={styles.section}
        >
          <SectionHeading
            description={coursePromoCatalog.advantages.description}
            eyebrow={coursePromoCatalog.advantages.eyebrow}
            title={coursePromoCatalog.advantages.title}
          />
          <View style={styles.advantageList}>
            {coursePromoCatalog.advantages.items.map((advantage, index) => {
              const Icon = advantageIcons[advantage.icon];
              return (
                <Card key={advantage.id} style={styles.advantageCard}>
                  <View style={styles.advantageTop}>
                    <View style={styles.smallIcon}><Icon color={colors.primary} size={20} /></View>
                    <AppText color={colors.primary} variant="micro">{String(index + 1).padStart(2, '0')}</AppText>
                  </View>
                  <AppText variant="cardTitle">{advantage.title}</AppText>
                  <AppText>{advantage.description}</AppText>
                </Card>
              );
            })}
          </View>
        </View>

        <View
          onLayout={({ nativeEvent }) => { sectionPositions.current.pricing = nativeEvent.layout.y; }}
          style={styles.section}
        >
          <SectionHeading
            description={coursePromoCatalog.pricing.description}
            eyebrow={coursePromoCatalog.pricing.eyebrow}
            title={coursePromoCatalog.pricing.title}
          />
          <ScrollView
            contentContainerStyle={styles.categoryTabs}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {coursePromoCatalog.pricing.categories.map((item) => {
              const selected = item.id === category.id;
              return (
                <Pressable
                  accessibilityLabel={`选择${item.label}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  key={item.id}
                  onPress={() => setCategoryId(item.id)}
                  style={({ pressed }) => [
                    styles.categoryTab,
                    selected ? styles.categoryTabActive : null,
                    pressed ? styles.pressed : null,
                  ]}
                  testID={`course-category-${item.id}`}
                >
                  <AppText color={selected ? colors.primaryForeground : colors.mutedForeground} numberOfLines={1} variant="button">{item.label}</AppText>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.planList}>
            {category.plans.map((plan) => <PlanCard key={plan.id} onPress={() => setActivePlan(plan)} plan={plan} />)}
          </View>
        </View>

        <Card
          elevated
          onLayout={({ nativeEvent }) => { sectionPositions.current.contact = nativeEvent.layout.y; }}
          style={styles.contactCard}
        >
          <View style={styles.contactIcon}><MessageCircle color={colors.primaryForeground} size={20} /></View>
          <AppText style={styles.quote} variant="sectionTitle">{coursePromoCatalog.contact.quote}</AppText>
          <AppText color={colors.primary} variant="button">{coursePromoCatalog.contact.label}：</AppText>
          <View style={styles.contactList}>
            {coursePromoCatalog.contact.wechatIds.map((wechatId) => (
              <AppText
                accessibilityLabel={`微信号 ${wechatId}，可长按复制`}
                key={wechatId}
                selectable
                style={styles.contactValue}
                variant="button"
              >
                {wechatId}
              </AppText>
            ))}
          </View>
          <AppText style={styles.footer} variant="micro">{coursePromoCatalog.contact.footer}</AppText>
        </Card>
      </ScrollView>

      <BottomSheet
        accessibilityLabel={activePlan ? `课程详情：${activePlan.name}` : '课程详情'}
        footer={activePlan ? (
          <View style={styles.sheetFooter}>
            <AppText variant="caption">{coursePromoCatalog.pricing.detailFooterNote}</AppText>
            <Button leading={<ArrowRight color={colors.primaryForeground} size={16} />} onPress={consult} size="lg">咨询该课程</Button>
          </View>
        ) : undefined}
        onClose={() => setActivePlan(undefined)}
        visible={Boolean(activePlan)}
      >
        {activePlan ? <CoursePlanDetail plan={activePlan} /> : null}
      </BottomSheet>
    </Screen>
  );
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <View style={styles.sectionHeading}>
      <AppText color={colors.primary} style={styles.eyebrow} variant="micro">{eyebrow}</AppText>
      <AppText accessibilityRole="header" variant="pageTitle">{title}</AppText>
      <AppText>{description}</AppText>
    </View>
  );
}

function PlanCard({ plan, onPress }: { plan: CoursePlan; onPress: () => void }) {
  return (
    <Card elevated={plan.popular} style={[styles.planCard, plan.popular ? styles.planCardPopular : null]}>
      <View style={styles.planHeader}>
        <AppText style={styles.planTitle} variant="sectionTitle">{plan.name}</AppText>
        {plan.badge ? <Tag tone="accent">{plan.badge}</Tag> : null}
      </View>
      <View style={styles.priceRow}>
        <AppText style={styles.price} variant="pageTitle">{plan.price}</AppText>
        <AppText variant="caption">{plan.unit}</AppText>
      </View>
      {plan.period ? <Tag>{plan.period}</Tag> : null}
      <AppText>{plan.description}</AppText>
      <Button
        accessibilityLabel={`查看${plan.name}详情`}
        onPress={onPress}
        variant={plan.popular ? 'primary' : 'outline'}
      >
        查看详情
      </Button>
    </Card>
  );
}

function CoursePlanDetail({ plan }: { plan: CoursePlan }) {
  return (
    <View style={styles.detail}>
      <View style={styles.detailHeader}>
        {plan.badge ? <Tag tone="accent">{plan.badge}</Tag> : null}
        <AppText accessibilityRole="header" variant="pageTitle">{plan.name}</AppText>
        <View style={styles.priceRow}>
          <AppText style={styles.detailPrice} variant="pageTitle">{plan.price}</AppText>
          <AppText variant="caption">{plan.unit}</AppText>
        </View>
        {plan.period ? <Tag>{plan.period}</Tag> : null}
        <AppText>{plan.description}</AppText>
      </View>

      <Card style={styles.notice}>
        <View style={styles.noticeTitle}><Info color={colors.primary} size={17} /><AppText color={colors.primary} variant="button">标准课程内容安排</AppText></View>
        <AppText variant="caption">{coursePromoCatalog.pricing.standardOutlineNotice}</AppText>
      </Card>

      <View style={styles.outlineBlock}>
        <AppText variant="sectionTitle">课程大纲</AppText>
        {plan.outline.map((section, index) => <OutlineSection index={index} key={section.id} section={section} />)}
      </View>

      {plan.privileges ? (
        <View style={styles.outlineBlock}>
          <AppText variant="sectionTitle">包过班特殊权限</AppText>
          {plan.privileges.map((section, index) => <OutlineSection index={index} key={section.id} section={section} privilege />)}
        </View>
      ) : null}
    </View>
  );
}

function OutlineSection({ section, index, privilege = false }: { section: CourseOutlineSection; index: number; privilege?: boolean }) {
  return (
    <View style={styles.outlineSection}>
      <View style={styles.outlineTitle}>
        <AppText color={colors.primary} variant="micro">{String(index + 1).padStart(2, '0')}</AppText>
        <AppText color={privilege ? colors.primary : colors.foreground} variant="cardTitle">{section.title}</AppText>
      </View>
      <View style={styles.outlineItems}>
        {section.items.map((item) => (
          <View key={item} style={styles.outlineItem}>
            <Check color={colors.primary} size={15} style={styles.checkIcon} />
            <AppText style={styles.outlineCopy}>{item}</AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { gap: spacing[8], paddingBottom: spacing[8] },
  hero: { alignItems: 'center', backgroundColor: colors.primary06, gap: spacing[3], paddingHorizontal: spacing[5], paddingVertical: spacing[8] },
  heroIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.xl, height: 48, justifyContent: 'center', width: 48 },
  eyebrow: { letterSpacing: 2.4 },
  heroTitle: { fontSize: 28, textAlign: 'center' },
  center: { textAlign: 'center' },
  heroActions: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[2], width: '100%' },
  heroAction: { flex: 1, paddingHorizontal: spacing[2] },
  metricList: { gap: spacing[3], paddingHorizontal: spacing[5] },
  metricCard: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  metricCopy: { flex: 1, gap: spacing[1] },
  metricValue: { fontSize: 24, lineHeight: 31 },
  smallIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.xl, height: 44, justifyContent: 'center', width: 44 },
  section: { gap: spacing[5], paddingHorizontal: spacing[5] },
  sectionHeading: { gap: spacing[2] },
  advantageList: { gap: spacing[3] },
  advantageCard: { gap: spacing[2.5] },
  advantageTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  categoryTabs: { gap: spacing[2], paddingRight: spacing[5] },
  categoryTab: { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, minHeight: 44, paddingHorizontal: spacing[4], justifyContent: 'center' },
  categoryTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  planList: { gap: spacing[3] },
  planCard: { gap: spacing[3] },
  planCardPopular: { borderColor: colors.primary20 },
  planHeader: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  planTitle: { flex: 1, minWidth: 190 },
  priceRow: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  price: { fontSize: 36, lineHeight: 43 },
  contactCard: { alignItems: 'center', gap: spacing[3], marginHorizontal: spacing[5], paddingHorizontal: spacing[5], paddingVertical: spacing[6] },
  contactIcon: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.full, height: 44, justifyContent: 'center', width: 44 },
  quote: { lineHeight: 27, textAlign: 'center' },
  contactList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], justifyContent: 'center' },
  contactValue: { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, fontFamily: fonts.monoRegular, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  footer: { marginTop: spacing[2], textAlign: 'center' },
  sheetFooter: { gap: spacing[3], paddingBottom: spacing[1] },
  detail: { gap: spacing[5], paddingBottom: spacing[4] },
  detailHeader: { gap: spacing[3] },
  detailPrice: { fontSize: 34, lineHeight: 41 },
  notice: { backgroundColor: colors.primary06, gap: spacing[2] },
  noticeTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  outlineBlock: { gap: spacing[3] },
  outlineSection: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing[3], paddingTop: spacing[4] },
  outlineTitle: { gap: spacing[1] },
  outlineItems: { gap: spacing[2.5] },
  outlineItem: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[2.5] },
  checkIcon: { marginTop: 3 },
  outlineCopy: { flex: 1 },
});
