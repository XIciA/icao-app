import {
  ArrowRight,
  Check,
  GraduationCap,
  Info,
  MessageCircle,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from '@/components/ui/icons';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TopBar } from '@/components/navigation/TopBar';
import { useWebLayout } from '@/components/platform/web-layout';
import { AppText, BottomSheet, Button, Card, Screen, Tag } from '@/components/ui';
import { colors, fonts, radii, shadows, spacing } from '@/theme';
import { SoftGlow } from '@/components/visual/SoftGlow';

import {
  webCoursePromoCatalog,
  type WebCourseOutlineSection,
  type WebCoursePlan,
  type WebCourseViewId,
} from './course-promo-catalog.web-data';

type SectionId = 'advantages' | 'pricing' | 'story';
type SectionPositions = Partial<Record<SectionId, number>>;

const advantageIcons: Record<string, LucideIcon> = {
  trend: TrendingUp,
  target: Target,
  users: Users,
  shield: ShieldCheck,
};

export function CourseCatalogScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const sectionPositions = useRef<SectionPositions>({});
  const { isDesktop, isMobile, mode } = useWebLayout();
  const insets = useSafeAreaInsets();
  const [activeViewId, setActiveViewId] = useState<WebCourseViewId>('icao4-initial');
  const [activePlan, setActivePlan] = useState<WebCoursePlan>();
  const [storyOpen, setStoryOpen] = useState(false);
  const view = webCoursePromoCatalog.pricing.views[activeViewId];

  const scrollToSection = (section: SectionId) => {
    const y = sectionPositions.current[section];
    if (typeof y === 'number') scrollRef.current?.scrollTo({ animated: true, y: Math.max(0, y - spacing[3]) });
  };

  const consult = () => {
    setActivePlan(undefined);
    requestAnimationFrame(() => scrollToSection('story'));
  };

  return (
    <Screen header={<TopBar title="体系课程" />} contentStyle={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing[8]) }]}
        keyboardShouldPersistTaps="handled"
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, isDesktop ? styles.heroDesktop : null]}>
          <SoftGlow intensity={0.45} size={320} style={styles.heroGlow} />
          <View style={styles.heroIcon}><GraduationCap color={colors.primary} size={25} /></View>
          <AppText color={colors.primary} style={styles.eyebrow} variant="micro">
            {webCoursePromoCatalog.hero.eyebrow}
          </AppText>
          <AppText
            accessibilityRole="header"
            style={[styles.heroTitle, isDesktop ? styles.heroTitleDesktop : null]}
            variant="pageTitle"
          >
            {webCoursePromoCatalog.hero.title}
          </AppText>
          <AppText style={styles.heroDescription}>{webCoursePromoCatalog.hero.description}</AppText>
        </View>

        <View
          onLayout={({ nativeEvent }) => { sectionPositions.current.advantages = nativeEvent.layout.y; }}
          style={[styles.section, isDesktop ? styles.sectionDesktop : null]}
        >
          <SectionHeading
            description={webCoursePromoCatalog.advantages.description}
            eyebrow={webCoursePromoCatalog.advantages.eyebrow}
            title={webCoursePromoCatalog.advantages.title}
          />
          <View
            style={[styles.cardGrid, styles.rowGrid]}
            testID={`course-promo-advantages-grid-${mode}`}
          >
            {webCoursePromoCatalog.advantages.items.map((advantage, index) => {
              const Icon = advantageIcons[advantage.icon];
              return (
                <Card key={advantage.id} style={[styles.advantageCard, styles.advantageHalfCard, isMobile ? styles.advantageCardMobile : null]}>
                  <View style={styles.advantageTop}>
                    <View style={styles.smallIcon}><Icon color={colors.primary} size={20} /></View>
                    <AppText color={colors.primary} style={styles.cardNumber} variant="micro">
                      {String(index + 1).padStart(2, '0')}
                    </AppText>
                  </View>
                  <AppText variant="cardTitle" style={isMobile ? styles.advantageTitleMobile : null}>{advantage.title}</AppText>
                  <AppText variant={isMobile ? 'caption' : 'body'}>{advantage.description}</AppText>
                </Card>
              );
            })}
          </View>
        </View>

        <View
          onLayout={({ nativeEvent }) => { sectionPositions.current.pricing = nativeEvent.layout.y; }}
          style={[styles.section, styles.pricingSection, isDesktop ? styles.sectionDesktop : null]}
        >
          <View style={styles.levelTabs} accessibilityRole="tablist" accessibilityLabel="目标等级">
            {(['icao4-initial', 'icao5'] as const).map((viewId) => {
              const selected = viewId === 'icao5' ? activeViewId === 'icao5' : activeViewId !== 'icao5';
              const label = viewId === 'icao5' ? 'ICAO 5 课程' : 'ICAO 4 课程';
              return (
                <Pressable
                  accessibilityLabel={`选择${label}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  key={viewId}
                  onPress={() => setActiveViewId(viewId)}
                  style={[styles.levelTab, selected ? styles.levelTabActive : null]}
                >
                  <AppText color={selected ? colors.primary : colors.mutedForeground} variant="button">{label}</AppText>
                </Pressable>
              );
            })}
          </View>
          <SectionHeading
            description={view.description}
            eyebrow={webCoursePromoCatalog.pricing.eyebrow}
            title={view.title}
          />

          {activeViewId !== 'icao5' ? (
            <View accessibilityRole="tablist" accessibilityLabel="ICAO 4 课程分类" style={styles.categoryTabs}>
              {webCoursePromoCatalog.pricing.tabViewIds.map((viewId) => {
                const tab = webCoursePromoCatalog.pricing.views[viewId];
                const selected = viewId === activeViewId;
                return (
                  <Pressable
                    accessibilityLabel={`选择${tab.label}`}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    key={viewId}
                    onPress={() => setActiveViewId(viewId)}
                    style={({ pressed }) => [
                      styles.categoryTab,
                      selected ? styles.categoryTabActive : null,
                      pressed ? styles.pressed : null,
                    ]}
                    testID={`course-category-${viewId}`}
                  >
                    <AppText
                      color={selected ? colors.foreground : colors.mutedForeground}
                      numberOfLines={1}
                      style={styles.categoryLabel}
                      variant="caption"
                    >
                      {tab.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View
            style={[styles.planGrid, !isMobile ? styles.rowGrid : null]}
            testID={`course-promo-plan-grid-${mode}`}
          >
            {view.plans.map((plan) => (
              <PlanCard
                isDesktop={isDesktop}
                isMobile={isMobile}
                key={plan.id}
                onPress={() => setActivePlan(plan)}
                plan={plan}
                planCount={view.plans.length}
              />
            ))}
          </View>
        </View>

        <View
          onLayout={({ nativeEvent }) => { sectionPositions.current.story = nativeEvent.layout.y; }}
          style={[styles.section, isDesktop ? styles.sectionDesktop : null]}
        >
          <Card elevated style={[styles.storyCard, isDesktop ? styles.storyCardDesktop : null]}>
            <AppText color={colors.primary} style={styles.eyebrow} variant="micro">
              {webCoursePromoCatalog.story.eyebrow}
            </AppText>
            <AppText accessibilityRole="header" style={styles.storyTitle} variant="sectionTitle">
              {webCoursePromoCatalog.story.title}
            </AppText>
            <AppText style={styles.center}>{webCoursePromoCatalog.story.description}</AppText>
            <Button
              accessibilityLabel="打开我们有话说"
              leading={<MessageCircle color={colors.primaryForeground} size={16} />}
              onPress={() => setStoryOpen(true)}
              size="lg"
            >
              我们有话说
            </Button>
            <AppText style={styles.center} variant="caption">点击阅读我们的故事与承诺</AppText>
            <View style={styles.contactPill}>
              <MessageCircle color={colors.primary} size={17} />
              <AppText color={colors.primary} style={styles.contactLabel} variant="button">
                {webCoursePromoCatalog.contact.label}：
              </AppText>
              <View style={styles.contactList}>
                {webCoursePromoCatalog.contact.wechatIds.map((wechatId) => (
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
            </View>
          </Card>

          <View style={styles.brandFooter}>
            <View style={styles.brand}>
              <View style={styles.brandIcon}><GraduationCap color={colors.primaryForeground} size={15} /></View>
              <AppText variant="cardTitle">{webCoursePromoCatalog.contact.brand}</AppText>
            </View>
            <AppText style={styles.center} variant="caption">{webCoursePromoCatalog.contact.footer}</AppText>
          </View>
        </View>
      </ScrollView>

      <BottomSheet
        accessibilityLabel={activePlan ? `课程详情：${activePlan.name}` : '课程详情'}
        footer={activePlan ? (
          <View style={styles.sheetFooter}>
            <AppText variant="caption">{webCoursePromoCatalog.pricing.detailFooterNote}</AppText>
            <Button
              leading={<ArrowRight color={colors.primaryForeground} size={16} />}
              onPress={consult}
              size="lg"
            >
              咨询该课程
            </Button>
          </View>
        ) : undefined}
        onClose={() => setActivePlan(undefined)}
        visible={Boolean(activePlan)}
      >
        {activePlan ? (
          <>
            <SheetHeader title="课程详情" onClose={() => setActivePlan(undefined)} />
            <CoursePlanDetail plan={activePlan} />
          </>
        ) : null}
      </BottomSheet>

      <BottomSheet
        accessibilityLabel="我们有话说"
        onClose={() => setStoryOpen(false)}
        visible={storyOpen}
        footer={<Button onPress={() => setStoryOpen(false)}>我知道了</Button>}
      >
        <SheetHeader title="我们有话说" onClose={() => setStoryOpen(false)} />
        <StoryDetail />
      </BottomSheet>
    </Screen>
  );
}

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={styles.sheetHeading}>
      <AppText variant="cardTitle">{title}</AppText>
      <Button accessibilityLabel={`关闭${title}`} onPress={onClose} size="icon" variant="ghost">
        <X color={colors.mutedForeground} size={20} />
      </Button>
    </View>
  );
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <View style={styles.sectionHeading}>
      <AppText color={colors.primary} style={styles.eyebrow} variant="micro">{eyebrow}</AppText>
      <AppText accessibilityRole="header" style={styles.sectionTitle} variant="pageTitle">{title}</AppText>
      <AppText style={styles.sectionDescription}>{description}</AppText>
    </View>
  );
}

function PlanCard({
  plan,
  onPress,
  isDesktop,
  isMobile,
  planCount,
}: {
  plan: WebCoursePlan;
  onPress: () => void;
  isDesktop: boolean;
  isMobile: boolean;
  planCount: number;
}) {
  const responsiveWidth = isMobile
    ? styles.fullCard
    : isDesktop && planCount === 3
      ? styles.thirdPlanCard
      : planCount === 1
        ? styles.singlePlanCard
        : styles.halfCard;

  return (
    <Card
      elevated={plan.popular}
      style={[styles.planCard, responsiveWidth, plan.popular ? styles.planCardPopular : null]}
    >
      {plan.popular ? <View style={styles.popularBadge}><AppText color={colors.primaryForeground} variant="caption">最受欢迎</AppText></View> : null}
      <AppText style={styles.planTitle} variant="sectionTitle">{plan.name}</AppText>
      <View style={styles.priceRow}>
        <AppText style={styles.price} variant="pageTitle">{plan.price}</AppText>
        <AppText style={styles.unit} variant="caption">{plan.unit}</AppText>
      </View>
      <AppText style={styles.planDescription}>{plan.description}</AppText>
      <Button
        accessibilityLabel={`查看${plan.name}详情`}
        onPress={onPress}
        variant={plan.popular ? 'primary' : 'secondary'}
        style={styles.planButton}
      >
        查看详情 →
      </Button>
    </Card>
  );
}

function CoursePlanDetail({ plan }: { plan: WebCoursePlan }) {
  const hasOutline = Boolean(plan.outline?.length);
  const hasPrivileges = Boolean(plan.privileges?.length);

  return (
    <View style={styles.detail}>
      <View style={styles.detailHeader}>
        <View style={styles.detailTags}>
          <Tag>{plan.detailLabel ?? '课程说明书'}</Tag>
          {plan.popular ? <Tag tone="accent">最受欢迎</Tag> : null}
        </View>
        <AppText accessibilityRole="header" variant="pageTitle">{plan.name}</AppText>
        <AppText>{plan.detailIntro ?? plan.description}</AppText>
        <View style={styles.priceRow}>
          <AppText style={styles.detailPrice} variant="pageTitle">{plan.price} 元</AppText>
          <Tag>{plan.unit.replace('元 / ', '')}</Tag>
        </View>
      </View>

      {hasOutline ? (
        <>
          <Card style={styles.notice}>
            <View style={styles.noticeTitle}>
              <Info color={colors.primary} size={17} />
              <AppText color={colors.primary} variant="button">标准课程内容安排</AppText>
            </View>
            <AppText variant="caption">{webCoursePromoCatalog.pricing.standardOutlineNotice}</AppText>
          </Card>
          <View style={styles.outlineBlock}>
            <AppText variant="sectionTitle">课程大纲</AppText>
            {plan.outline?.map((section, index) => (
              <OutlineSection index={index} key={`${section.title}-${index}`} section={section} />
            ))}
          </View>
        </>
      ) : null}

      {hasPrivileges ? (
        <View style={styles.outlineBlock}>
          <AppText variant="sectionTitle">包过班特殊权限</AppText>
          {plan.privileges?.map((section, index) => (
            <OutlineSection index={index} key={`${section.title}-${index}`} privilege section={section} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function OutlineSection({
  section,
  index,
  privilege = false,
}: {
  section: WebCourseOutlineSection;
  index: number;
  privilege?: boolean;
}) {
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

function StoryDetail() {
  return (
    <View style={styles.detail}>
      <View style={styles.detailHeader}>
        <Tag>OUR STORY</Tag>
        <AppText accessibilityRole="header" variant="pageTitle">{webCoursePromoCatalog.story.dialogTitle}</AppText>
        <AppText>{webCoursePromoCatalog.story.dialogDescription}</AppText>
      </View>
      <View style={styles.storyParagraphs}>
        {webCoursePromoCatalog.story.paragraphs.map((paragraph) => <AppText key={paragraph}>{paragraph}</AppText>)}
      </View>
      <Card style={styles.storyQuote}>
        <AppText style={styles.quoteText} variant="sectionTitle">{webCoursePromoCatalog.story.quote}</AppText>
      </Card>
      <AppText variant="caption">{webCoursePromoCatalog.story.footer}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { paddingBottom: spacing[8] },
  levelTabs: { flexDirection: 'row', justifyContent: 'center', gap: spacing[5] },
  levelTab: { minHeight: 44, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', paddingHorizontal: spacing[2] },
  levelTabActive: { borderBottomColor: colors.primary },
  sheetHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing[4] },
  hero: {
    alignItems: 'center',
    backgroundColor: colors.background,
    overflow: 'hidden',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[8],
  },
  heroGlow: { top: -spacing[20], alignSelf: 'center' },
  heroDesktop: { paddingHorizontal: spacing[8], paddingVertical: spacing[20] },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: colors.primary10,
    borderRadius: radii.full,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  eyebrow: { letterSpacing: 2.4, textTransform: 'uppercase' },
  heroTitle: { textAlign: 'center' },
  heroTitleDesktop: { fontSize: 48, lineHeight: 58 },
  heroDescription: { maxWidth: 760, textAlign: 'center' },
  rowGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  halfCard: { width: '48.6%' },
  fullCard: { width: '100%' },
  thirdPlanCard: { width: '31.8%' },
  singlePlanCard: { maxWidth: 620, width: '100%' },
  center: { textAlign: 'center' },
  smallIcon: {
    alignItems: 'center',
    backgroundColor: colors.primary10,
    borderRadius: radii.xl,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  section: { gap: spacing[5], paddingHorizontal: spacing[4], paddingVertical: spacing[8] },
  sectionDesktop: { gap: spacing[12], paddingHorizontal: spacing[8], paddingVertical: spacing[24] },
  pricingSection: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  sectionHeading: { alignItems: 'center', alignSelf: 'center', gap: spacing[2], maxWidth: 680 },
  sectionTitle: { textAlign: 'center' },
  sectionDescription: { textAlign: 'center' },
  cardGrid: { alignSelf: 'center', gap: spacing[2.5], maxWidth: 1120, width: '100%' },
  advantageHalfCard: { flexBasis: '45%', flexGrow: 1 },
  advantageCardMobile: { borderRadius: radii.xl, padding: spacing[3], gap: spacing[2] },
  advantageTitleMobile: { fontSize: 16, lineHeight: 24 },
  advantageCard: { gap: spacing[3], padding: spacing[6], backgroundColor: colors.card },
  advantageTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  cardNumber: { fontFamily: fonts.serifSemibold, fontSize: 30, lineHeight: 38, opacity: 0.18 },
  categoryTabs: { alignSelf: 'center', width: '100%', maxWidth: 680, flexDirection: 'row', gap: spacing[1], padding: spacing[1], backgroundColor: colors.secondary, borderRadius: radii.full, borderWidth: 1, borderColor: colors.border },
  categoryLabel: { fontFamily: fonts.sansMedium, textAlign: 'center' },
  categoryTab: {
    flex: 1,
    borderRadius: radii.full,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing[1],
  },
  categoryTabActive: { backgroundColor: colors.card, borderColor: colors.primary20, ...shadows.card },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  planGrid: { alignSelf: 'center', gap: spacing[4], maxWidth: 1120, width: '100%' },
  planCard: { backgroundColor: colors.card, gap: spacing[4], padding: spacing[5] },
  planCardPopular: { borderColor: colors.primary, marginTop: spacing[3] },
  popularBadge: { alignSelf: 'center', backgroundColor: colors.primary, borderRadius: radii.full, marginTop: -spacing[8], paddingHorizontal: spacing[4], paddingVertical: spacing[1] },
  planButton: { borderRadius: radii.full },
  planTitle: { fontSize: 20, lineHeight: 28 },
  priceRow: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  price: { fontSize: 40, lineHeight: 48 },
  detailPrice: { fontSize: 32, lineHeight: 40 },
  unit: { flexShrink: 1 },
  planDescription: { flexGrow: 1 },
  storyCard: { backgroundColor: colors.card, alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[5], paddingVertical: spacing[10] },
  storyCardDesktop: { paddingHorizontal: spacing[16], paddingVertical: spacing[16] },
  storyTitle: { fontSize: 24, lineHeight: 34, textAlign: 'center' },
  contactPill: {
    alignItems: 'center',
    backgroundColor: colors.primary10,
    borderColor: colors.primary20,
    borderRadius: radii.xl,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    justifyContent: 'center',
    marginTop: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  contactLabel: { flexShrink: 1 },
  contactList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], justifyContent: 'center' },
  contactValue: { color: colors.primary, fontFamily: fonts.monoRegular },
  brandFooter: { alignItems: 'center', gap: spacing[3] },
  brand: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  brandIcon: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  sheetFooter: { gap: spacing[3], paddingBottom: spacing[1] },
  detail: { gap: spacing[5], paddingBottom: spacing[4] },
  detailHeader: { gap: spacing[3] },
  detailTags: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  notice: { backgroundColor: colors.primary06, gap: spacing[2] },
  noticeTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  outlineBlock: { gap: spacing[3] },
  outlineSection: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing[3],
    paddingTop: spacing[4],
  },
  outlineTitle: { gap: spacing[1] },
  outlineItems: { gap: spacing[2.5] },
  outlineItem: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[2.5] },
  checkIcon: { marginTop: 3 },
  outlineCopy: { flex: 1 },
  storyParagraphs: { gap: spacing[4] },
  storyQuote: { backgroundColor: colors.primary06 },
  quoteText: { lineHeight: 29 },
});
