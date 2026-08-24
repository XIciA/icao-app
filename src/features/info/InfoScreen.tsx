import type {
  FeedbackCategory,
  FeedbackDiagnosticFeature,
  FeedbackQuestionContext,
  FeedbackSource,
} from '@icao/contracts';
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
} from '@/components/ui/icons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Linking, Platform, Pressable, Share, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { APP_DISPLAY_VERSION } from '@/config/app-version';
import { isEdgeOneProductionWeb } from '@/config/web-runtime';
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
          <Row icon={Info} label="关于听你五个" hint={`版本 ${APP_DISPLAY_VERSION}`} onPress={() => router.push('/info/about')} />
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
    ['我的标注和笔记会同步吗？', Platform.OS === 'web' && !isEdgeOneProductionWeb() ? 'Web 体验版只保存在当前浏览器，不与 App 同步；清理浏览器数据后会丢失。' : '登录后，支持的学习数据会通过现有同步服务保存。'],
    ['随身听支持后台播放吗？', '支持后台播放和系统媒体控制；具体表现取决于系统设置与当前 App 版本。'],
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
  feature?: FeedbackDiagnosticFeature;
  correlationId?: string;
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
  const [category, setCategory] = useState<FeedbackCategory>(initialCategory);
  const [description, setDescription] = useState(initialDescription);
  const [contact, setContact] = useState('');
  const [images, setImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');
  const dirty = description.length > 0 || contact.length > 0 || images.length > 0;

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
        diagnosticFeature,
        diagnosticCorrelationId,
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
  if (code === 'web_demo_feature_unavailable') return 'Web 体验版暂不提供意见反馈，请在 iOS 或 Android App 中提交。';
  return '提交失败，请检查网络后重试。你的文字和图片已保留。';
}

function AboutPage() {
  const router = useRouter();

  async function handleRate() {
    const url = Platform.OS === 'ios' ? 'https://apps.apple.com' : 'market://details?id=com.readyoufife.app';
    const can = await Linking.canOpenURL(url).catch(() => false);
    if (can) {
      await Linking.openURL(url);
    } else {
      Alert.alert('暂时无法打开应用商店', '请稍后在对应应用商店中搜索“听你五个”。');
    }
  }

  async function handleShare() {
    try {
      await Share.share({
        message: `听你五个（Read You 5）- 航空英语·陆空通话备考助手\n版本：${APP_DISPLAY_VERSION}\n与我一起高效备考 ICAO 英语！`,
        title: '听你五个备考助手',
      });
    } catch {
      // ignore
    }
  }

  function handleCheckUpdate() {
    Alert.alert('检查更新', `当前版本为 ${APP_DISPLAY_VERSION}。请前往对应应用商店查看是否有可用更新。`);
  }

  return (
    <Page title="关于听你五个">
      <View style={styles.aboutHero}>
        <View style={styles.logo}><Upload color={colors.primaryForeground} size={28} style={{ transform: [{ rotate: '-45deg' }] }} /></View>
        <AppText variant="sectionTitle">听你五个</AppText>
        <AppText variant="micro">Read You 5</AppText>
        <AppText variant="caption">航空英语 · 陆空通话备考助手</AppText>
        <View style={styles.versionPill}><AppText variant="micro">版本 {APP_DISPLAY_VERSION}</AppText></View>
      </View>
      <View style={styles.content}>
        <Section>
          <Row first icon={RefreshCcw} label="检查更新" onPress={handleCheckUpdate} value={`当前 ${APP_DISPLAY_VERSION}`} />
          <Row hint="去应用商店支持我们" icon={Star} label="给我们评分" onPress={() => void handleRate()} />
          <Row icon={Upload} label="分享给朋友" onPress={() => void handleShare()} />
        </Section>
        <Section>
          <Row first icon={FileText} label="用户协议" onPress={() => router.push('/info/agreement')} />
          <Row icon={ShieldCheck} label="隐私政策" onPress={() => router.push('/info/privacy')} />
        </Section>
        <AppText style={styles.copyright} variant="micro">Copyright © 2026 听你五个{`\n`}All rights reserved</AppText>
      </View>
    </Page>
  );
}

function LegalPage({ page }: { page: 'agreement' | 'privacy' }) {
  const isAgreement = page === 'agreement';
  const isWeb = Platform.OS === 'web';
  const textAiDescription = isWeb
    ? '回答文本只在您主动请求分析时发送至阿里云百炼通义千问。'
    : '回答文本只在您主动请求分析时发送至 DeepSeek 开放平台，用于语法纠错和表达润色。';
  const thirdPartyDescription = isWeb
    ? '我们使用阿里云基础设施、腾讯云 EdgeOne、腾讯云语音识别、阿里云百炼及 Apple/Android 操作系统和分发平台提供必要的托管、加速、AI、系统权限和分发能力。'
    : '我们使用阿里云基础设施、腾讯云 EdgeOne、腾讯云语音识别、杭州深度求索人工智能基础技术研究有限公司提供的 DeepSeek 开放平台，以及 Apple/Android 操作系统和分发平台提供必要的托管、加速、AI、系统权限和分发能力。';
  const aiRecordsDescription = isWeb
    ? 'AI 用量日志记录账号、请求编号、功能、状态、模型、提示版本、耗时和用量，不记录录音或完整回答内容。AI 单词查询缓存默认保留 30 天。账号和学习数据在账号存续及提供同步服务所需期间保存；达到目的、保存期届满、您撤回同意或注销账号后，我们会依法删除或停止处理。'
    : 'AI 用量日志记录账号、请求编号、功能、状态、模型、提示版本、耗时和用量，不记录录音或完整回答内容。本地静态词典查词不调用文本 AI、不消耗 AI 点数，也不生成 AI 查询缓存。账号和学习数据在账号存续及提供同步服务所需期间保存；达到目的、保存期届满、您撤回同意或注销账号后，我们会依法删除或停止处理。';
  const minorDescription = isWeb
    ? '本应用主要面向成年航空英语学习者。不满十四周岁的用户应在监护人同意和指导下使用。我们采用访问控制、加密传输、受限存储、备份和日志审计保护数据；如发生可能影响您权益的安全事件，将依法采取补救并告知。政策发生重要变化时会显著提示，并在依法需要时重新取得同意。'
    : '本应用面向16周岁及以上的航空英语学习者，不向16周岁以下用户提供服务。我们采用访问控制、加密传输、受限存储、备份和日志审计保护数据；如发生可能影响您权益的安全事件，将依法采取补救并告知。政策发生重要变化时会显著提示，并在依法需要时重新取得同意。';
  const intro = isAgreement
    ? '欢迎使用由云启航科（成都）科技有限公司提供的听你五个。在登录或使用本应用前，请仔细阅读并充分理解本协议。'
    : '云启航科（成都）科技有限公司重视您的个人信息与隐私。本政策按听你五个当前实际功能说明数据的收集、使用、存储、共享和删除方式。';
  const clauses = isAgreement ? [
    ['协议主体与适用范围', '本协议是您与云启航科（成都）科技有限公司就使用听你五个 iOS、Android、Web 产品及其相关服务达成的约定。您开始使用服务即表示已阅读并同意本协议及隐私政策。'],
    ['账号与登录', '本产品通过手机号短信验证码或运营阶段提供的授权方式建立账号。您应妥善保管验证码和登录状态，不得转售、出租或以其他方式允许未经授权的第三方使用。发现异常登录时，请及时退出全部设备并联系支持。'],
    ['学习服务与 AI 边界', '本应用提供航空英语题库、音频、录音、转写和 AI 辅助反馈。练习结果仅供学习参考，不代表 ICAO、民航监管机构、考试机构或用人单位的官方评分、认证或专业结论。'],
    ['内容与知识产权', '题库、音频、课程、文章、界面、软件及相关成果受知识产权法律保护。除法律允许或另有书面授权外，仅限个人学习使用，不得批量复制、抓取、传播、出售、反向工程或用于训练其他模型。'],
    ['用户内容与反馈', '您应确保提交的回答、录音、文字、图片和联系方式合法且不侵犯他人权益。您授权我们在提供转写、分析、同步、客服和故障处理所必需的范围内处理这些内容，具体规则见隐私政策。'],
    ['使用规范', '不得利用本服务实施违法活动、攻击或绕过访问控制、干扰服务器、冒用他人身份、传播恶意程序，或以自动化方式消耗超出正常学习所需的资源。'],
    ['服务变更与可用性', '我们会尽力保障服务连续和数据安全，但网络、设备、第三方服务、维护或不可抗力可能造成暂时中断。涉及重要功能、收费或个人信息处理规则的重大变化，将依法提前告知并在需要时重新取得同意。'],
    ['退出、注销与责任', '您可以退出账号、退出全部设备或在应用内申请注销。注销会删除账号及依法无需继续保留的关联数据，且通常无法恢复。任何一方违反本协议或法律规定的，应依法承担相应责任。'],
    ['联系与争议处理', '产品支持请联系 support@yunqihangke.com，法律事务请联系 legal@yunqihangke.com。本协议适用中华人民共和国法律；争议应先友好协商，协商不成的，依法向有管辖权的人民法院处理。'],
  ] : [
    ['处理者与联系方式', '个人信息处理者为云启航科（成都）科技有限公司，注册地址为成都未来科技城（成都东部新区未来大道118号3层9号-3）。隐私问题、权利请求或投诉请联系 privacy@yunqihangke.com。'],
    ['账号与安全信息', '我们处理手机号、账号标识、昵称、登录时间、会话和安全记录，用于短信验证码登录、账号保护、设备会话管理和防止滥用。认证会话保存在 App 设备安全存储或浏览器站点存储中；我们不读取通讯录或定位信息。'],
    ['学习与本地数据', '我们处理做题状态、学习进度、收藏、标注、笔记、回答、学习记录和用户文档，用于本机学习和登录后的云端同步。部分数据先保存在设备本地；登录时会提示您确认旧本机数据归属。'],
    ['麦克风、录音与 AI', `只有您主动开始口语练习时才申请麦克风权限。录音先保存在应用缓存；只有您点击“转写”并明确同意后，录音才会经我们的服务器发送至腾讯云语音识别。${textAiDescription}音频签名链接默认有效 10 分钟，处理完成后删除，异常残留最长保留 24 小时。您可以拒绝或在“设置—AI 与隐私”撤回同意，不影响无需 AI 的功能。`],
    ['反馈、诊断与相册权限', '提交反馈时，我们处理反馈内容、可选联系方式、来源页面、App/系统版本、错误编号及关联题目。只有您从录音或 AI 错误区域点击“提交诊断”并继续提交反馈时，才会随工单附带与本次故障错误编号完全一致的脱敏技术事件。允许字段限于功能类型、诊断编号、App/构建/平台/系统版本、相对时间、处理阶段、稳定错误码、状态、耗时、大小、格式及必要的请求编号；单次最多 30 条，本机最多保留 50 条并在 24 小时后自动清除，服务端诊断最长保留 365 天并由定时任务清除。诊断不包含录音、回答、文件地址（URI）、Token 或账号信息。只有您主动添加图片时才调用系统照片选择器；图片存入私有存储并按当前政策期限清理，反馈文字用于工单处理，账号注销时会删除依法无需继续保留的关联数据。'],
    ['AI 记录与保存期限', aiRecordsDescription],
    ['第三方处理与共享', `${thirdPartyDescription}我们仅在实现对应功能所需范围内提供数据，不出售个人信息；除取得您的同意、履行合同所必需或法律法规另有要求外，不向无关第三方提供。正式第三方清单和链接将在公开隐私政策中持续更新。`],
    ['您的权利与账号注销', '您可以在应用中查看和修改部分学习数据、撤回 AI 同意、退出当前或全部设备，并在账号安全页面申请注销。您也可通过 privacy@yunqihangke.com 请求查阅、复制、更正、补充、删除或解释个人信息处理规则，我们会依法核验身份并处理。'],
    ['未成年人、保护措施与更新', minorDescription],
  ];
  return (
    <Page title={isAgreement ? '用户协议' : '隐私政策'}>
      <View style={styles.legal}>
        <AppText variant="pageTitle">{isAgreement ? '用户服务协议' : '隐私政策'}</AppText>
        <AppText variant="micro">{isAgreement ? '版本 v4.0 · 更新于 2026-08-20 · 生效于 2026-08-20' : '版本 v4.0 · 更新于 2026-08-20 · 生效于 2026-08-20'}</AppText>
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
        <AppText style={styles.center} variant="micro">云启航科（成都）科技有限公司 · {isAgreement ? 'legal' : 'privacy'}@yunqihangke.com</AppText>
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
  legal: { gap: spacing[4], padding: spacing[5] },
  intro: { backgroundColor: colors.secondary },
  clause: { gap: spacing[2] },
  clauseTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  number: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.sm, height: 22, justifyContent: 'center', width: 22 },
  clauseBody: { paddingLeft: spacing[8] },
});
