import { AboutPage } from './AboutPage.native';
import type { VersionedFeedbackQuestionContext } from '@icao/contracts/feedback-ops';
import type {
  FeedbackCategory,
  FeedbackDiagnosticFeature,
  FeedbackSource,
} from '@icao/contracts';
import { useFocusEffect, useNavigation, usePreventRemove } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ImagePlus,
  ShieldCheck,
  X,
} from '@/components/ui/icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import {
  createClientSubmissionId,
  submitFeedback,
} from '@/features/feedback/feedback-client.native';
import { colors, radii, spacing } from '@/theme';

import { builtinAppContent, loadAppContent } from '@/features/app-content/repository.native';
import { LegalDocumentBody } from '@/features/app-content/LegalDocumentBody.native';
import { NativeScreenBoundary } from '@/components/states/NativeScreenBoundary.native';

type InfoSlug = 'about' | 'help' | 'feedback' | 'agreement' | 'privacy' | 'services';
const pages: InfoSlug[] = ['about', 'help', 'feedback', 'agreement', 'privacy', 'services'];
const MAX_IMAGE_COUNT = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const CATEGORY_OPTIONS: { label: string; value: FeedbackCategory }[] = [
  { label: '功能建议', value: 'feature_suggestion' },
  { label: '内容纠错', value: 'content_correction' },
  { label: '其他', value: 'other' },
];

export function InfoScreen() {
  const params = useLocalSearchParams<FeedbackParams & { slug: InfoSlug }>();
  const { slug } = params;
  const resetKey = JSON.stringify([slug, params.source, params.sourceRoute, params.bankId, params.categoryId, params.topicId, params.cardId, params.bankVersion, params.bankChecksum, params.correlationId, params.feature]);
  return <NativeScreenBoundary title={slug === 'about' ? '关于听你五个' : slug === 'feedback' ? '意见反馈' : slug === 'help' ? '帮助中心' : '政策与条款'} fallbackHref={slug === 'about' ? '/account/settings' : '/(tabs)/profile'} resetKey={resetKey}><InfoContent /></NativeScreenBoundary>;
}

function InfoContent() {
  const { slug } = useLocalSearchParams<{ slug: InfoSlug }>();
  const page: InfoSlug = pages.includes(slug) ? slug : 'help';
  if (page === 'about') return <AboutPage />;
  if (page === 'help') return <HelpPage />;
  if (page === 'feedback') return <FeedbackPage />;
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

function HelpPage() {
  const [open, setOpen] = useState(-1);
  const [faqs, setFaqs] = useState(builtinAppContent.help);
  useFocusEffect(useCallback(() => {
    let active = true;
    void loadAppContent().then(({ data }) => {
      if (active) { setFaqs(data.payload.help); setOpen(-1); }
    }).catch(() => undefined);
    return () => { active = false; };
  }, []));
  return (
    <Page title="帮助中心">
      <View style={styles.content}>
        <View style={styles.faqList}>
          {faqs.map(({ id, question, answer }, index) => (
            <Pressable key={id} onPress={() => setOpen(open === index ? -1 : index)}>
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
  feature?: FeedbackDiagnosticFeature;
  correlationId?: string;
  bankId?: string;
  categoryId?: string;
  topicId?: string;
  cardId?: string;
  bankVersion?: string;
  bankChecksum?: string;
};

function FeedbackPage() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<FeedbackParams>();
  const source: FeedbackSource = params.source === 'study' ? 'study' : 'profile';
  const diagnosticCorrelationId = typeof params.correlationId === 'string' && params.correlationId.length > 0
    ? params.correlationId
    : undefined;
  const diagnosticFeature: FeedbackDiagnosticFeature | undefined = diagnosticCorrelationId && (params.feature === 'recording' || params.feature === 'ai')
    ? params.feature
    : undefined;
  const initialCategory: FeedbackCategory = diagnosticFeature
    ? 'other'
    : source === 'study' ? 'content_correction' : 'feature_suggestion';
  const initialDescription = diagnosticFeature === 'recording'
    ? '录音功能出现异常，请协助排查。'
    : diagnosticFeature === 'ai'
      ? 'AI 转写或分析功能出现异常，请协助排查。'
      : '';
  const question = useMemo<VersionedFeedbackQuestionContext | undefined>(() => (
    source === 'study' && params.bankId && params.categoryId && params.topicId && params.cardId
      ? {
          bankId: params.bankId,
          categoryId: params.categoryId,
          topicId: params.topicId,
          cardId: params.cardId,
          ...(params.bankVersion && Number.isSafeInteger(Number(params.bankVersion)) && Number(params.bankVersion) > 0 ? { bankVersion: Number(params.bankVersion) } : {}),
          ...(params.bankChecksum ? { bankChecksum: params.bankChecksum } : {}),
        }
      : undefined
  ), [params.bankId, params.bankVersion, params.bankChecksum, params.cardId, params.categoryId, params.topicId, source]);
  const [clientSubmissionId, setClientSubmissionId] = useState(createClientSubmissionId);
  const submittedFingerprint = useRef<string | undefined>(undefined);
  const [category, setCategory] = useState<FeedbackCategory>(initialCategory);
  const [description, setDescription] = useState(initialDescription);
  const [contact, setContact] = useState('');
  const [images, setImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');
  const mounted = useRef(true);
  const submission = useRef<AbortController | undefined>(undefined);
  const dirty = description.length > 0 || contact.length > 0 || images.length > 0;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; submission.current?.abort(); };
  }, []);

  useEffect(() => {
    setClientSubmissionId(createClientSubmissionId());
    setCategory(initialCategory);
    setDescription(initialDescription);
    setContact('');
    setImages([]);
    setError('');
    setTicketNumber('');
  }, [diagnosticCorrelationId, initialCategory, initialDescription, params.bankId, params.cardId, params.categoryId, params.topicId, source]);

  usePreventRemove(dirty && !ticketNumber, ({ data }) => {
    Alert.alert('放弃本次反馈？', submitting ? '提交结果尚未确认。离开后将停止等待，服务端可能已经收到本次反馈。' : '未提交的文字和图片不会保存。', [
      { text: '继续填写', style: 'cancel' },
      { text: '放弃', style: 'destructive', onPress: () => { submission.current?.abort(); navigation.dispatch(data.action); } },
    ]);
  });

  async function chooseImages() {
    if (submission.current) return;
    try {
      const remaining = MAX_IMAGE_COUNT - images.length;
      if (remaining <= 0) {
        Alert.alert('最多添加 3 张图片');
        return;
      }
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!mounted.current) return;
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
      if (!mounted.current || submission.current) return;
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
    } catch {
      if (mounted.current) setError('暂时无法添加图片，请重试。已填写的内容仍保留。');
    }
  }

  async function submit() {
    if (description.trim().length < 5 || submission.current) return;
    const operation = new AbortController();
    submission.current = operation;
    setSubmitting(true);
    setError('');
    try {
      const fingerprint = JSON.stringify({ category, description, contact, question, images: images.map((image) => image.uri) });
      const submissionId = submittedFingerprint.current !== undefined && submittedFingerprint.current !== fingerprint
        ? createClientSubmissionId() : clientSubmissionId;
      submittedFingerprint.current = fingerprint;
      if (submissionId !== clientSubmissionId) setClientSubmissionId(submissionId);
      const result = await submitFeedback({
        clientSubmissionId: submissionId,
        category,
        description,
        contact,
        source,
        sourceRoute: params.sourceRoute ?? (source === 'study' ? '/question-bank/study' : '/(tabs)/profile'),
        question,
        images,
        diagnosticFeature,
        diagnosticCorrelationId,
        signal: operation.signal,
      });
      if (mounted.current && !operation.signal.aborted) setTicketNumber(result.ticketNumber);
    } catch (cause) {
      if (mounted.current && !operation.signal.aborted) setError(feedbackErrorMessage(cause));
    } finally {
      if (submission.current === operation) submission.current = undefined;
      if (mounted.current) setSubmitting(false);
    }
  }

  function reset() {
    setClientSubmissionId(createClientSubmissionId());
    setCategory(initialCategory);
    setDescription(initialDescription);
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
            <Button onPress={() => {
              if (source === 'study' && router.canGoBack()) { router.back(); return; }
              const routeBank = /^\/question-bank\/(listening|sentences900|radiotelephony|opi|storytelling)(?:\/|$)/.exec(params.sourceRoute ?? '')?.[1];
              if (source === 'study' && routeBank) router.replace({ pathname: '/question-bank/[bankId]', params: { bankId: routeBank } });
              else router.replace('/(tabs)/profile');
            }} size="lg">{source === 'study' ? '返回学习' : '返回我的'}</Button>
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
        {diagnosticFeature ? (
          <View style={styles.diagnosticNotice}>
            <ShieldCheck color={colors.primary} size={18} />
            <View style={styles.flex}>
              <AppText variant="button">将附带本次故障的脱敏诊断</AppText>
              <AppText variant="micro">
                只有你点击“提交反馈”后，才会尝试附带本机仍保留且与本次错误编号完全一致的诊断，最多 30 条技术事件；不包含录音、回答、文件地址、Token 或账号信息。
              </AppText>
            </View>
          </View>
        ) : null}
        <Choice disabled={submitting} options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
        <TextField
          editable={!submitting}
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
                  disabled={submitting}
                  hitSlop={8}
                  onPress={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  style={styles.removeImage}
                >
                  <X color={colors.primaryForeground} size={13} />
                </Pressable>
              </View>
            ))}
            {images.length < MAX_IMAGE_COUNT ? (
              <Pressable accessibilityLabel="添加反馈图片" disabled={submitting} onPress={() => void chooseImages()} style={styles.upload}>
                <ImagePlus color={colors.mutedForeground} size={20} />
                <AppText variant="micro">添加</AppText>
              </Pressable>
            ) : null}
          </View>
        </View>
        <TextField
          editable={!submitting}
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
  if (code === 'web_demo_feature_unavailable') return 'Web 体验版暂不提供意见反馈，请在 iOS 或 Android App 中提交。';
  return '提交失败，请检查网络后重试。你的文字和图片已保留。';
}

function LegalPage({ page }: { page: 'agreement' | 'privacy' | 'services' }) {
  const isAgreement = page === 'agreement';
  const documentId = page === 'services' ? 'thirdPartyServices' : page;
  const [document, setDocument] = useState(builtinAppContent.legal[documentId]);
  useEffect(() => {
    let active = true;
    setDocument(builtinAppContent.legal[documentId]);
    void loadAppContent().then(({ data }) => { if (active) setDocument(data.payload.legal[documentId]); }).catch(() => undefined);
    return () => { active = false; };
  }, [documentId]);
  return (
    <Page title={page === 'services' ? '第三方服务清单' : isAgreement ? '用户协议' : '隐私政策'}>
      <LegalDocumentBody document={document} />
    </Page>
  );
}

function Choice({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { label: string; value: FeedbackCategory }[];
  value: FeedbackCategory;
  onChange: (value: FeedbackCategory) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.choice}>
      <AppText variant="button">反馈类型</AppText>
      <View style={styles.chips}>
        {options.map((option) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: option.value === value, disabled }}
            disabled={disabled}
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
  diagnosticNotice: { alignItems: 'flex-start', backgroundColor: colors.primary06, borderColor: colors.primary20, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing[2.5], padding: spacing[3] },
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

});
