import type { FeedbackCategory, FeedbackQuestionContext, FeedbackSource } from '@icao/contracts';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  HelpCircle,
  ImagePlus,
  Info,
  RefreshCcw,
  ShieldCheck,
  Star,
  Upload,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Linking, Platform, Pressable, Share, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { APP_DISPLAY_VERSION } from '@/config/app-version';
import {
  createClientSubmissionId,
  submitFeedback,
} from '@/features/feedback/feedback-client';
import { colors, radii, spacing } from '@/theme';

type InfoSlug = 'hub' | 'help' | 'feedback' | 'about' | 'agreement' | 'privacy';
const pages: InfoSlug[] = ['hub', 'help', 'feedback', 'about', 'agreement', 'privacy'];
const MAX_IMAGE_COUNT = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const CATEGORY_OPTIONS: { label: string; value: FeedbackCategory }[] = [
  { label: '功能建议', value: 'feature_suggestion' },
  { label: '内容纠错', value: 'content_correction' },
  { label: '其他', value: 'other' },
];

export function InfoScreen() {
  const { slug } = useLocalSearchParams<{ slug: InfoSlug }>();
  const page: InfoSlug = pages.includes(slug) ? slug : 'hub';
  if (page === 'hub') return <InfoHub />;
  if (page === 'help') return <HelpPage />;
  if (page === 'feedback') return <FeedbackPage />;
  if (page === 'about') return <AboutPage />;
  return <LegalPage page={page} />;
}

function Page({
  title,
  children,
  scroll = true,
}: {
  title: string;
  children: React.ReactNode;
  scroll?: boolean;
}) {
  return <Screen scroll={scroll} keyboard contentStyle={styles.screen}><TopBar title={title} />{children}</Screen>;
}

function InfoHub() {
  const router = useRouter();
  return (
    <Page title="信息与帮助">
      <View style={styles.content}>
        <Section title="帮助">
          <Row icon={HelpCircle} label="帮助中心" hint="查看常见问题" first onPress={() => router.push('/info/help')} />
          <Row icon={Info} label="关于飞猪 ICAO" hint={`版本 ${APP_DISPLAY_VERSION}`} onPress={() => router.push('/info/about')} />
        </Section>
        <Section title="法律条款">
          <Row icon={FileText} label="用户协议" first onPress={() => router.push('/info/agreement')} />
          <Row icon={ShieldCheck} label="隐私政策" onPress={() => router.push('/info/privacy')} />
        </Section>
      </View>
    </Page>
  );
}

function HelpPage() {
  const [open, setOpen] = useState(-1);
  const faqs = [
    ['如何切换不同的题库？', '在题库首页进入对应模块，即可切换学习内容。'],
    ['我的标注和笔记会同步吗？', '登录后，支持的学习数据会通过现有同步服务保存。'],
    ['随身听支持后台播放吗？', '后台播放能力以当前 Development Build 的系统行为为准。'],
    ['如何提交内容纠错？', '在刷题学习页顶部点击“纠错”，系统会自动附带当前题目信息。'],
  ];
  return (
    <Page title="帮助中心">
      <View style={styles.content}>
        <View style={styles.faqList}>
          {faqs.map(([question, answer], index) => (
            <Pressable key={question} onPress={() => setOpen(open === index ? -1 : index)}>
              <Card style={styles.faq}>
                <View style={styles.row}>
                  <BookOpen color={colors.primary} size={16} />
                  <AppText style={styles.flex} variant="button">{question}</AppText>
                  <ChevronDown
                    color={colors.mutedForeground}
                    size={16}
                    style={{ transform: [{ rotate: open === index ? '180deg' : '0deg' }] }}
                  />
                </View>
                {open === index ? <AppText style={styles.answer}>{answer}</AppText> : null}
              </Card>
            </Pressable>
          ))}
        </View>
      </View>
    </Page>
  );
}

type FeedbackParams = {
  source?: FeedbackSource;
  sourceRoute?: string;
  bankId?: string;
  categoryId?: string;
  topicId?: string;
  cardId?: string;
};

function FeedbackPage() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<FeedbackParams>();
  const source: FeedbackSource = params.source === 'study' ? 'study' : 'profile';
  const question = useMemo<FeedbackQuestionContext | undefined>(() => (
    source === 'study' && params.bankId && params.categoryId && params.topicId && params.cardId
      ? {
          bankId: params.bankId,
          categoryId: params.categoryId,
          topicId: params.topicId,
          cardId: params.cardId,
        }
      : undefined
  ), [params.bankId, params.cardId, params.categoryId, params.topicId, source]);
  const [clientSubmissionId, setClientSubmissionId] = useState(createClientSubmissionId);
  const [category, setCategory] = useState<FeedbackCategory>(source === 'study' ? 'content_correction' : 'feature_suggestion');
  const [description, setDescription] = useState('');
  const [contact, setContact] = useState('');
  const [images, setImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');
  const dirty = description.length > 0 || contact.length > 0 || images.length > 0;

  useEffect(() => {
    setClientSubmissionId(createClientSubmissionId());
    setCategory(source === 'study' ? 'content_correction' : 'feature_suggestion');
    setDescription('');
    setContact('');
    setImages([]);
    setError('');
    setTicketNumber('');
  }, [params.bankId, params.cardId, params.categoryId, params.topicId, source]);

  usePreventRemove(dirty && !ticketNumber, ({ data }) => {
    Alert.alert('放弃本次反馈？', '未提交的文字和图片不会保存。', [
      { text: '继续填写', style: 'cancel' },
      { text: '放弃', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  async function chooseImages() {
    const remaining = MAX_IMAGE_COUNT - images.length;
    if (remaining <= 0) {
      Alert.alert('最多添加 3 张图片');
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('无法访问相册', '请在系统设置中允许访问照片后重试。');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: remaining,
      quality: 1,
    });
    if (result.canceled) return;
    const candidates = result.assets.slice(0, remaining);
    const accepted: ImagePicker.ImagePickerAsset[] = [];
    let rejectedFormat = false;
    let rejectedSize = false;
    for (const asset of candidates) {
      if (!isSupportedImage(asset)) {
        rejectedFormat = true;
        continue;
      }
      if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_IMAGE_BYTES) {
        rejectedSize = true;
        continue;
      }
      if (!images.some((current) => current.uri === asset.uri) && !accepted.some((current) => current.uri === asset.uri)) {
        accepted.push(asset);
      }
    }
    setImages((current) => [...current, ...accepted].slice(0, MAX_IMAGE_COUNT));
    if (rejectedFormat || rejectedSize) {
      Alert.alert(
        '部分图片未添加',
        [rejectedFormat ? '仅支持 JPEG、PNG、WebP。' : '', rejectedSize ? '每张图片不能超过 5 MB。' : ''].filter(Boolean).join('\n'),
      );
    }
  }

  async function submit() {
    if (description.trim().length < 5 || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await submitFeedback({
        clientSubmissionId,
        category,
        description,
        contact,
        source,
        sourceRoute: params.sourceRoute ?? (source === 'study' ? '/question-bank/study' : '/profile'),
        question,
        images,
      });
      setTicketNumber(result.ticketNumber);
    } catch (cause) {
      setError(feedbackErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setClientSubmissionId(createClientSubmissionId());
    setCategory(source === 'study' ? 'content_correction' : 'feature_suggestion');
    setDescription('');
    setContact('');
    setImages([]);
    setError('');
    setTicketNumber('');
  }

  if (ticketNumber) {
    return (
      <Page title="提交反馈" scroll={false}>
        <View style={styles.result}>
          <View style={styles.resultIcon}><CheckCircle2 color={colors.primary} size={38} /></View>
          <AppText variant="sectionTitle">反馈已收到</AppText>
          <AppText style={styles.center}>感谢你的反馈，请保存反馈编号。</AppText>
          <View style={styles.ticket}><AppText color={colors.primary} variant="cardTitle">{ticketNumber}</AppText></View>
          <View style={styles.resultActions}>
            <Button onPress={() => router.replace('/(tabs)/profile')} size="lg">返回我的</Button>
            <Button onPress={reset} size="lg" variant="outline">再提一条</Button>
          </View>
        </View>
      </Page>
    );
  }

  return (
    <Page title="提交反馈">
      <View style={styles.feedback}>
        {question ? (
          <View style={styles.context}>
            <AppText color={colors.primary} variant="button">已关联当前题目</AppText>
            <AppText numberOfLines={1} variant="micro">{question.bankId} · {question.cardId}</AppText>
          </View>
        ) : null}
        <Choice options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
        <TextField
          error={description.length > 0 && description.trim().length < 5 ? '请至少输入 5 个字' : undefined}
          label="问题描述"
          maxLength={500}
          multiline
          onChangeText={setDescription}
          placeholder={source === 'study' ? '请描述题目中需要纠正的内容。' : '请详细描述你的建议或遇到的问题。'}
          style={styles.textarea}
          value={description}
        />
        <AppText style={styles.count} variant="micro">{description.length} / 500</AppText>
        <View style={styles.uploadGroup}>
          <View style={styles.imageHeader}>
            <AppText variant="button">添加图片（选填）</AppText>
            <AppText variant="micro">{images.length} / 3 · 每张不超过 5 MB</AppText>
          </View>
          <View style={styles.imageList}>
            {images.map((image, index) => (
              <View key={`${image.uri}-${index}`} style={styles.preview}>
                <Image accessibilityLabel={`反馈图片 ${index + 1}`} source={{ uri: image.uri }} style={styles.previewImage} />
                <Pressable
                  accessibilityLabel={`移除反馈图片 ${index + 1}`}
                  hitSlop={8}
                  onPress={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  style={styles.removeImage}
                >
                  <X color={colors.primaryForeground} size={13} />
                </Pressable>
              </View>
            ))}
            {images.length < MAX_IMAGE_COUNT ? (
              <Pressable accessibilityLabel="添加反馈图片" onPress={() => void chooseImages()} style={styles.upload}>
                <ImagePlus color={colors.mutedForeground} size={20} />
                <AppText variant="micro">添加</AppText>
              </Pressable>
            ) : null}
          </View>
        </View>
        <TextField
          label="联系方式（选填）"
          maxLength={100}
          onChangeText={setContact}
          placeholder="手机号、邮箱或其他方便联系你的方式"
          value={contact}
        />
        {error ? (
          <View accessibilityLiveRegion="polite" style={styles.error}>
            <AppText color={colors.destructive} variant="caption">{error}</AppText>
          </View>
        ) : null}
        <Button disabled={description.trim().length < 5 || submitting} onPress={() => void submit()} size="lg" testID="feedback-submit">
          {submitting ? '正在提交…' : '提交反馈'}
        </Button>
        <AppText style={styles.center} variant="micro">图片仅用于处理本次反馈，将保存在私有存储中。</AppText>
      </View>
    </Page>
  );
}

function isSupportedImage(asset: ImagePicker.ImagePickerAsset) {
  const mimeType = asset.mimeType?.toLowerCase();
  if (mimeType) return ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType);
  const name = asset.fileName?.toLowerCase() ?? asset.uri.toLowerCase();
  return /\.(jpe?g|png|webp)(?:$|[?#])/u.test(name);
}

function feedbackErrorMessage(cause: unknown) {
  const code = cause instanceof Error ? cause.message : 'feedback_submit_failed';
  if (code === 'feedback_rate_limited') return '提交较频繁，请稍后再试。';
  if (code === 'feedback_image_too_large') return '有图片超过 5 MB，请移除后重试。';
  if (code === 'invalid_feedback_image') return '图片格式无效，请仅使用 JPEG、PNG 或 WebP。';
  if (code === 'missing_bearer_token' || code === 'invalid_bearer_token') return '登录状态已失效，请重新登录后提交。';
  return '提交失败，请检查网络后重试。你的文字和图片已保留。';
}

function AboutPage() {
  const router = useRouter();

  async function handleRate() {
    const url = Platform.OS === 'ios' ? 'https://apps.apple.com' : 'market://details?id=com.icao.app';
    const can = await Linking.canOpenURL(url).catch(() => false);
    if (can) {
      await Linking.openURL(url);
    } else {
      Alert.alert('感谢支持', '当前处于内测阶段，暂未上线 App Store 应用商店。');
    }
  }

  async function handleShare() {
    try {
      await Share.share({
        message: `飞猪 ICAO - 航空英语·陆空通话备考助手\n版本：${APP_DISPLAY_VERSION}\n与我一起高效备考 ICAO 英语！`,
        title: '飞猪 ICAO 备考助手',
      });
    } catch {
      // ignore
    }
  }

  function handleCheckUpdate() {
    Alert.alert('检查更新', `当前版本（${APP_DISPLAY_VERSION}）已是最新版本。`);
  }

  return (
    <Page title="关于飞猪 ICAO">
      <View style={styles.aboutHero}>
        <View style={styles.logo}><Upload color={colors.primaryForeground} size={28} style={{ transform: [{ rotate: '-45deg' }] }} /></View>
        <AppText variant="sectionTitle">飞猪 ICAO</AppText>
        <AppText variant="caption">航空英语 · 陆空通话备考助手</AppText>
        <View style={styles.versionPill}><AppText variant="micro">版本 {APP_DISPLAY_VERSION}</AppText></View>
      </View>
      <View style={styles.content}>
        <Section>
          <Row first icon={RefreshCcw} label="检查更新" onPress={handleCheckUpdate} value="已是最新版本" />
          <Row hint="去应用商店支持我们" icon={Star} label="给我们评分" onPress={() => void handleRate()} />
          <Row icon={Upload} label="分享给朋友" onPress={() => void handleShare()} />
        </Section>
        <Section>
          <Row first icon={FileText} label="用户协议" onPress={() => router.push('/info/agreement')} />
          <Row icon={ShieldCheck} label="隐私政策" onPress={() => router.push('/info/privacy')} />
        </Section>
        <AppText style={styles.copyright} variant="micro">Copyright © 2026 飞猪 ICAO{`\n`}All rights reserved</AppText>
      </View>
    </Page>
  );
}

function LegalPage({ page }: { page: 'agreement' | 'privacy' }) {
  const isAgreement = page === 'agreement';
  const intro = isAgreement
    ? '欢迎使用飞猪 ICAO。在注册或使用本应用前，请仔细阅读并充分理解本协议各条款。'
    : '我们非常重视您的个人信息与隐私保护。本政策说明我们如何收集、使用、存储和保护您的信息，请您仔细阅读。';
  const clauses = isAgreement ? [
    ['协议的接受与变更', '本协议构成您与本应用之间就使用服务达成的完整约定。我们可能根据业务需要不时更新本协议。'],
    ['账号注册与使用', '您应提供真实、准确的注册信息，并妥善保管账号与密码。因保管不当造成的损失由您自行承担。'],
    ['学习内容与知识产权', '应用内题库、音频、课程及文章等内容受知识产权法律保护，仅供个人学习使用。'],
    ['用户行为规范', '不得利用本服务从事违法违规活动，不得干扰平台正常运行。'],
  ] : [
    ['我们收集的信息', '账号信息：注册时的账号与昵称等基础资料。学习数据：您的做题记录、收藏、标注与学习进度。'],
    ['信息的使用', '我们仅在提供学习服务、优化学习体验和保障账号安全的范围内使用上述信息。'],
    ['信息的存储与保护', '反馈文字进入业务数据库；反馈图片进入私有存储，提交后保留一年，账号注销时随账号数据删除。'],
    ['信息的共享', '除法律法规要求外，我们不会向无关第三方出售或共享您的个人信息。'],
  ];
  return (
    <Page title={isAgreement ? '用户协议' : '隐私政策'}>
      <View style={styles.legal}>
        <AppText variant="pageTitle">{isAgreement ? '用户服务协议' : '隐私政策'}</AppText>
        <AppText variant="micro">版本 v2.4 · 更新于 2026-06-01 · 生效于 2026-06-15</AppText>
        <Card style={styles.intro}><AppText>{intro}</AppText></Card>
        {clauses.map(([title, body], index) => (
          <View key={title} style={styles.clause}>
            <View style={styles.clauseTitle}>
              <View style={styles.number}><AppText color={colors.primary} variant="micro">{index + 1}</AppText></View>
              <AppText variant="button">{title}</AppText>
            </View>
            <AppText style={styles.clauseBody}>{body}</AppText>
          </View>
        ))}
        <AppText style={styles.center} variant="micro">— 本文档为示例文案，非正式法律文本 —</AppText>
      </View>
    </Page>
  );
}

function Choice({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: FeedbackCategory }[];
  value: FeedbackCategory;
  onChange: (value: FeedbackCategory) => void;
}) {
  return (
    <View style={styles.choice}>
      <AppText variant="button">反馈类型</AppText>
      <View style={styles.chips}>
        {options.map((option) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: option.value === value }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.chip, option.value === value && styles.chipSelected]}
          >
            <AppText color={option.value === value ? colors.primary : colors.mutedForeground} variant="micro">{option.label}</AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return <View style={styles.section}>{title ? <AppText variant="caption">{title}</AppText> : null}<Card style={styles.rows}>{children}</Card></View>;
}

function Row({
  icon: Icon,
  label,
  hint,
  value,
  first = false,
  onPress,
}: {
  icon: typeof Info;
  label: string;
  hint?: string;
  value?: string;
  first?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <View style={[styles.menuRow, !first && styles.border]}>
      <View style={styles.menuIcon}><Icon color={colors.primary} size={16} /></View>
      <View style={styles.flex}>
        <AppText variant="button">{label}</AppText>
        {hint ? <AppText variant="micro">{hint}</AppText> : null}
      </View>
      {value ? <AppText variant="caption">{value}</AppText> : null}
      {onPress ? <ChevronRight color={colors.mutedForeground} size={16} /> : null}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { gap: spacing[5], padding: spacing[4] },
  section: { gap: spacing[2] },
  rows: { padding: 0 },
  menuRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], minHeight: 58, paddingHorizontal: spacing[3] },
  border: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  menuIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.md, height: 34, justifyContent: 'center', width: 34 },
  flex: { flex: 1 },
  faqList: { gap: spacing[2.5] },
  faq: { gap: spacing[3], padding: spacing[3] },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  answer: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing[3] },
  feedback: { gap: spacing[4], padding: spacing[5] },
  context: { backgroundColor: colors.primary06, borderColor: colors.primary, borderRadius: radii.md, borderWidth: 1, gap: spacing[1], padding: spacing[3] },
  choice: { gap: spacing[2] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  chipSelected: { backgroundColor: colors.primary10, borderColor: colors.primary },
  textarea: { minHeight: 112, textAlignVertical: 'top' },
  count: { marginTop: -spacing[3], textAlign: 'right' },
  uploadGroup: { gap: spacing[2] },
  imageHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  imageList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  upload: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.md, borderStyle: 'dashed', borderWidth: 1, gap: spacing[1], height: 78, justifyContent: 'center', width: 78 },
  preview: { height: 78, position: 'relative', width: 78 },
  previewImage: { borderRadius: radii.md, height: 78, width: 78 },
  removeImage: { alignItems: 'center', backgroundColor: colors.foreground, borderRadius: radii.full, height: 24, justifyContent: 'center', position: 'absolute', right: -5, top: -5, width: 24 },
  error: { backgroundColor: 'rgba(219,43,51,0.08)', borderRadius: radii.md, padding: spacing[3] },
  result: { alignItems: 'center', flex: 1, gap: spacing[3], justifyContent: 'center', padding: spacing[8] },
  resultIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.full, height: 80, justifyContent: 'center', width: 80 },
  ticket: { backgroundColor: colors.primary06, borderRadius: radii.md, marginTop: spacing[2], paddingHorizontal: spacing[5], paddingVertical: spacing[3] },
  center: { textAlign: 'center' },
  resultActions: { gap: spacing[2.5], marginTop: spacing[4], width: '100%' },
  aboutHero: { alignItems: 'center', gap: spacing[2], paddingTop: spacing[8] },
  logo: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.full, height: 62, justifyContent: 'center', width: 62 },
  versionPill: { backgroundColor: colors.secondary, borderRadius: radii.full, marginTop: spacing[1], paddingHorizontal: spacing[3], paddingVertical: spacing[1.5] },
  copyright: { lineHeight: 18, marginTop: spacing[4], textAlign: 'center' },
  legal: { gap: spacing[4], padding: spacing[5] },
  intro: { backgroundColor: colors.secondary },
  clause: { gap: spacing[2] },
  clauseTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  number: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.sm, height: 22, justifyContent: 'center', width: 22 },
  clauseBody: { paddingLeft: spacing[8] },
});
