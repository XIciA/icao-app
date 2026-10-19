/** Tutorial metadata only. Learning content and results stay in the existing stores. */
export const SENTENCE_ONE_ID = 'sentence900-main-001';
export const TUTORIAL_STEPS = [
  { id: 'play', title: '先听一遍', description: '点播放，先听一遍。', target: 'audio' },
  { id: 'reveal', title: '展开原文与答案', description: '点这里，查看原文和翻译。', target: 'answer' },
  { id: 'highlight', title: '标出自己的重点', description: '开启高亮，标出 Maintaining。', target: 'highlight' },
  { id: 'tag', title: '给这道题加个标签', description: '给这道题加一个标签。', target: 'tag' },
  { id: 'note', title: '记下一句学习笔记', description: '在「我的笔记」里记下一个要点，再点完成。', target: 'workbench' },
  { id: 'lookup', title: '长按查一个词', description: '长按 Maintaining 查词；Web端可开启「查词」后点词。', target: 'text' },
  { id: 'favorite', title: '把生词收进词本', description: '点亮星标，把这个词收入共用词本。', target: 'favorite' },
  { id: 'record', title: '试着读出这句话', description: '点录音，读完后再点一次结束。', target: 'audio' },
  { id: 'review', title: '看看转写与匹配结果', description: '点「AI评分」查看转写匹配；沿用原额度，不评价发音。', target: 'workbench' },
  { id: 'finish', title: '结束这次学习', description: '点结束，看看这次学习的积累。', target: 'finish' },
  { id: 'recap', title: '从回顾回到原题', description: '从回顾打开 Sentence1，找回刚才的标注和生词。', target: 'recap' },
] as const;
export type TutorialStepId = typeof TUTORIAL_STEPS[number]['id'];
export type TutorialTargetId = typeof TUTORIAL_STEPS[number]['target'];
export type TutorialProgress = { version: 1; step: number; completed: TutorialStepId[]; skipped: TutorialStepId[]; recordId?: string };
export function emptyTutorialProgress(): TutorialProgress { return { version: 1, step: 0, completed: [], skipped: [] }; }
export function parseTutorialProgress(value: string | null): TutorialProgress {
  try {
    const p = JSON.parse(value ?? 'null');
    const ids = new Set(TUTORIAL_STEPS.map(step => step.id));
    if (p?.version !== 1 || !Number.isInteger(p.step) || p.step < 0 || p.step > TUTORIAL_STEPS.length) return emptyTutorialProgress();
    return { version: 1, step: p.step, completed: Array.isArray(p.completed) ? p.completed.filter((id: TutorialStepId) => ids.has(id)) : [], skipped: Array.isArray(p.skipped) ? p.skipped.filter((id: TutorialStepId) => ids.has(id)) : [], recordId: typeof p.recordId === 'string' ? p.recordId : undefined };
  } catch { return emptyTutorialProgress(); }
}
export function advanceTutorial(p: TutorialProgress, id: TutorialStepId, skip = false): TutorialProgress {
  if (TUTORIAL_STEPS[p.step]?.id !== id) return p;
  return { ...p, step: p.step + 1, completed: skip ? p.completed : [...new Set([...p.completed, id])], skipped: skip ? [...new Set([...p.skipped, id])] : p.skipped };
}
export function tutorialProgressKey(accountId: string) { return `icao.usage-guide.v1.${accountId}`; }
