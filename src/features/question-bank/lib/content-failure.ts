/** Shared meaning for content failures; callers only choose navigation. */
export function contentFailure(error: unknown): { title: string; description: string; action: 'none' | 'download' | 'retry'; kind: 'download' | 'verification' | 'failure' } | undefined {
  const code = (error as { code?: string })?.code;
  switch (code) {
    case 'offline_content_incomplete': return { title: '这部分内容未下载', description: '联网后可继续学习。', action: 'download' as const, kind: 'download' as const };
    case 'offline_content_missing': return { title: '内容未下载', description: '联网后可学习。', action: 'download' as const, kind: 'download' as const };
    case 'offline_content_outdated':
    case 'offline_resource_outdated': return { title: '内容需要更新', description: '联网更新对应题库后可继续学习。', action: 'download' as const, kind: 'download' as const };
    case 'offline_authorization_required': return { title: '需要联网验证', description: '联网验证后可继续使用本机内容。', action: 'retry' as const, kind: 'verification' as const };
    case 'offline_resource_unavailable': return { title: '本机内容不可用', description: '联网修复下载后可继续学习。', action: 'download' as const, kind: 'download' as const };
    default: return undefined;
  }
}
