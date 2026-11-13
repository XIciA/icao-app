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
} from '@/components/ui/icons';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { useWebLayout } from '@/components/platform/web-layout';
import { AppText, BottomSheet, Button, Card, PressableCard, Screen, Tag } from '@/components/ui';
import { colors, fonts, radii, shadows, spacing } from '@/theme';

import {
  webCoursePromoCatalog,
  type WebCourseOutlineSection,
  type WebCoursePlan,
  type WebCourseViewId,
} from './course-promo-catalog.web-data';

type SectionId = 'advantages' | 'pricing' | 'story';
type SectionPositions = Partial<Record<SectionId, number>>;

const destinationIcons: Record<string, LucideIcon> = {
  icao4: TrendingUp,
  icao5: Layers,
  advantages: Plane,
};

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
  const [activeViewId, setActiveViewId] = useState<WebCourseViewId>('icao4-initial');
  const [activePlan, setActivePlan] = useState<WebCoursePlan>();
  const [storyOpen, setStoryOpen] = useState(false);
  const view = webCoursePromoCatalog.pricing.views[activeViewId];

  const scrollToSection = (section: SectionId) => {
    const y = sectionPositions.current[section];
    if (typeof y === 'number') scrollRef.current?.scrollTo({ animated: true, y: Math.max(0, y - spacing[3]) });
  };

  const showCourseView = (viewId: WebCourseViewId) => {
    setActiveViewId(viewId);
    requestAnimationFrame(() => scrollToSection('pricing'));
  };

  const consult = () => {
    setActivePlan(undefined);
    requestAnimationFrame(() => scrollToSection('story'));
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
        <View style={[styles.hero, isDesktop ? styles.heroDesktop : null]}>
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

          <View
            style={[styles.destinationGrid, !isMobile ? styles.rowGrid : null]}
            testID={`course-promo-hero-grid-${mode}`}
          >
            {webCoursePromoCatalog.hero.destinations.map((destination) => {
              const Icon = destinationIcons[destination.id];
              return (
                <PressableCard
                  accessibilityLabel={`${destination.title}：${destination.description}`}
                  key={destination.id}
                  onPress={() => {
                    if ('viewId' in destination) showCourseView(destination.viewId);
                    else scrollToSection('advantages');
                  }}
                  style={[styles.destinationCard, !isMobile ? styles.thirdCard : null]}
                >
                  <View style={styles.smallIcon}><Icon color={colors.primary} size={20} /></View>
                  <AppText style={styles.destinationTitle} variant="sectionTitle">{destination.title}</AppText>
                  <AppText style={styles.center} variant="caption">{destination.description}</AppText>
                </PressableCard>
              );
            })}
          </View>
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
            style={[styles.cardGrid, !isMobile ? styles.rowGrid : null]}
            testID={`course-promo-advantages-grid-${mode}`}
          >
            {webCoursePromoCatalog.advantages.items.map((advantage, index) => {
              const Icon = advantageIcons[advantage.icon];
              return (
                <Card key={advantage.id} style={[styles.advantageCard, !isMobile ? styles.halfCard : null]}>
                  <View style={styles.advantageTop}>
                    <View style={styles.smallIcon}><Icon color={colors.primary} size={20} /></View>
                    <AppText color={colors.primary} style={styles.cardNumber} variant="micro">
                      {String(index + 1).padStart(2, '0')}
                    </AppText>
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
          style={[styles.section, styles.pricingSection, isDesktop ? styles.sectionDesktop : null]}
        >
          <SectionHeading
            description={view.description}
            eyebrow={webCoursePromoCatalog.pricing.eyebrow}
            title={view.title}
          />

          {activeViewId !== 'icao5' ? (
            <ScrollView
              contentContainerStyle={styles.categoryTabs}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
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
                      variant="button"
                    >
                      {tab.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
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
        {activePlan ? <CoursePlanDetail plan={activePlan} /> : null}
      </BottomSheet>

      <BottomSheet
        accessibilityLabel="我们有话说"
        onClose={() => setStoryOpen(false)}
        visible={storyOpen}
      >
        <StoryDetail />
      </BottomSheet>
    </Screen>
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
      {plan.popular ? <Tag tone="accent">最受欢迎</Tag> : null}
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
      >
        查看详情
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
  hero: {
    alignItems: 'center',
    backgroundColor: colors.primary06,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[12],
  },
  heroDesktop: { paddingHorizontal: spacing[8], paddingVertical: spacing[20] },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: colors.primary10,
    borderRadius: radii.xl,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  eyebrow: { letterSpacing: 2.4, textTransform: 'uppercase' },
  heroTitle: { fontSize: 30, lineHeight: 39, textAlign: 'center' },
  heroTitleDesktop: { fontSize: 48, lineHeight: 58 },
  heroDescription: { maxWidth: 760, textAlign: 'center' },
  destinationGrid: { gap: spacing[4], marginTop: spacing[8], maxWidth: 960, width: '100%' },
  destinationCard: { alignItems: 'center', gap: spacing[2], minHeight: 180, padding: spacing[6] },
  destinationTitle: { fontSize: 22, lineHeight: 29, marginTop: spacing[2], textAlign: 'center' },
  rowGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  thirdCard: { width: '31.8%' },
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
  section: { gap: spacing[8], paddingHorizontal: spacing[5], paddingVertical: spacing[16] },
  sectionDesktop: { gap: spacing[12], paddingHorizontal: spacing[8], paddingVertical: spacing[24] },
  pricingSection: { backgroundColor: colors.primary06 },
  sectionHeading: { alignItems: 'center', alignSelf: 'center', gap: spacing[2], maxWidth: 680 },
  sectionTitle: { textAlign: 'center' },
  sectionDescription: { textAlign: 'center' },
  cardGrid: { alignSelf: 'center', gap: spacing[4], maxWidth: 1120, width: '100%' },
  advantageCard: { gap: spacing[3], minHeight: 190, padding: spacing[6] },
  advantageTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  cardNumber: { fontFamily: fonts.serifSemibold, fontSize: 30, lineHeight: 38, opacity: 0.18 },
  categoryTabs: { flexGrow: 1, gap: spacing[1], justifyContent: 'center', paddingHorizontal: spacing[1] },
  categoryTab: {
    backgroundColor: colors.secondary,
    borderColor: colors.border,
    borderRadius: radii.full,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing[5],
  },
  categoryTabActive: { backgroundColor: colors.card, borderColor: colors.primary20, ...shadows.card },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  planGrid: { alignSelf: 'center', gap: spacing[4], maxWidth: 1120, width: '100%' },
  planCard: { gap: spacing[4], minHeight: 330, padding: spacing[6] },
  planCardPopular: { borderColor: colors.primary20 },
  planTitle: { fontSize: 20, lineHeight: 28 },
  priceRow: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  price: { fontSize: 40, lineHeight: 48 },
  detailPrice: { fontSize: 32, lineHeight: 40 },
  unit: { flexShrink: 1 },
  planDescription: { flexGrow: 1 },
  storyCard: { alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[5], paddingVertical: spacing[10] },
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
  contactValue: { fontFamily: fonts.monoRegular },
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
