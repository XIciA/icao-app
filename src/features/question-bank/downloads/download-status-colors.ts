import { colors } from '@/theme';

export type DownloadStatusTone = 'neutral' | 'success' | 'waiting' | 'error';

const tones: Record<string, DownloadStatusTone> = {
  未下载: 'neutral', 可扩展: 'neutral', 检查更新: 'neutral', 暂无下载: 'neutral',
  已下载: 'success', 已是最新: 'success', 已下载项为最新: 'success',
  等待下载: 'waiting', 等待中: 'waiting', 排队中: 'waiting', 准备中: 'waiting', 下载中: 'waiting', 校验中: 'waiting',
  已暂停: 'waiting', 主动暂停: 'waiting', 等待网络: 'waiting', '等待 Wi-Fi': 'waiting', 网络中断: 'waiting',
  有未完成下载: 'waiting', 稍后重试: 'waiting', 待登录: 'waiting', 待验证: 'waiting', 需会员: 'waiting', 资源未就绪: 'waiting',
  空间不足: 'waiting', 有更新: 'waiting', 检查中: 'waiting',
  校验失败: 'error', 下载失败: 'error', 删除失败: 'error', 保存失败: 'error', 验证失败: 'error',
  检查失败: 'error', 部分检查失败: 'error',
};

export function downloadStatusTone(status: string): DownloadStatusTone {
  return tones[status] ?? (/^\d+ 项有更新$/.test(status) ? 'waiting' : 'neutral');
}

const palette = {
  neutral: { backgroundColor: colors.secondary, color: colors.mutedForeground },
  success: { backgroundColor: colors.answerCorrectBackground, color: colors.successForeground },
  waiting: { backgroundColor: `${colors.accent}14`, color: colors.accent },
  error: { backgroundColor: `${colors.destructive}14`, color: colors.destructive },
};

/** Text and background share a semantic tone; unrecognized labels are never assumed failures. */
export function downloadStatusColors(status: string) {
  return palette[downloadStatusTone(status)];
}
