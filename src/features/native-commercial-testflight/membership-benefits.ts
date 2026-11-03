import { Download, Flame, Headphones, Library, Mic, Sparkles, type LucideIcon } from '@/components/ui/icons';

/** Display copy only; access remains owned by the existing entitlement checks. */
export const membershipBenefits: readonly { icon: LucideIcon; title: string; detail: string }[] = [
  { icon: Library, title: '完整会员题库', detail: '解锁五大题库的会员题目与参考内容' },
  { icon: Sparkles, title: '每周 AI 学习额度', detail: '用于录音转写、语法纠错与表达优化' },
  { icon: Headphones, title: '随身听会员音频', detail: '解锁会员题目音频，随时跟听练习' },
  { icon: Mic, title: '模拟考试练习', detail: '按考试类型和所选板块组卷练习' },
  { icon: Flame, title: 'OPI 热点练习', detail: '解锁关联参考答案、音频与作答练习；热点概览免费' },
  { icon: Download, title: '题库离线下载', detail: '在 App 内下载题目与配套音频，会员有效期内离线学习' },
];
