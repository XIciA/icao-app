/** UI feedback has one fixed status slot; transport errors are not membership facts. */
export function compactDownloadError(error: unknown): string {
  const message = typeof error === 'string' ? error : (error as { code?: string })?.code ?? (error instanceof Error ? error.message : '');
  if (['已暂停', '待登录', '待验证', '需会员', '资源未就绪', '网络中断', '空间不足', '校验失败', '有更新', '下载失败', '删除失败', '保存失败', '验证失败'].includes(message)) return message;
  if (message === 'membership_required') return '需会员';
  if (message === 'unauthorized' || (error as { status?: number })?.status === 401) return '待登录';
  if (message === 'download_resource_unavailable' || message === 'resource_not_found' || /资源暂不可用/.test(message)) return '资源未就绪';
  if (/credential|验证|会员权限|sandbox_environment/.test(message)) return '待验证';
  if (/校验|checksum|size_mismatch/.test(message)) return '校验失败';
  if (/空间|ENOSPC|space/.test(message)) return '空间不足';
  if (/保存失败/.test(message)) return '保存失败';
  if (/删除失败/.test(message)) return '删除失败';
  if (/变化|更新|version|release_changed/.test(message)) return '有更新';
  if (/暂停/.test(message)) return '已暂停';
  if (/网络|联网|network|timeout|fetch failed/i.test(message)) return '网络中断';
  return '下载失败';
}
