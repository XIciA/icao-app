/** Tutorial metadata only. Learning content and results stay in the existing stores. */
export const SENTENCE_ONE_ID = 'sentence900-main-001';
export const TUTORIAL_STEPS = [
  { id: 'play', title: '先听一遍', description: '点击播放，听听 Sentence1。音频可以重播，也可以调整倍速。', target: 'audio' },
  { id: 'reveal', title: '展开原文与答案', description: '点击上方「答案」，查看音频原文和中文翻译。', target: 'answer' },
  { id: 'highlight', title: '标出自己的重点', description: '点击「高亮」选择颜色，再点选或拖选原文中的 Maintaining。', target: 'highlight' },
  { id: 'tag', title: '给这道题加个标签', description: '点击「标签」，选择一个标签。以后可以在「我的标注」中按标签找题。', target: 'tag' },
  { id: 'note', title: '记下一句学习笔记', description: '已为你切到「我的笔记」。点击编辑，记录一个要点，再点完成保存。', target: 'workbench' },
  { id: 'lookup', title: '长按查一个词', description: '长按原文中的 Maintaining，查看音标、航空释义和常用释义。Web端可开启「查词」后点词。', target: 'text' },
  { id: 'favorite', title: '把生词收进词本', description: '在查词结果里点亮星标。它与单词学习的收藏统一显示在「我的 → 单词收藏」。', target: 'favorite' },
  { id: 'record', title: '试着读出这句话', description: '点击录音，读出 Maintaining FL310.，然后结束录音。保存成功后可以回放。', target: 'audio' },
  { id: 'review', title: '看看转写与匹配结果', description: '点击「AI评分」，沿用正常的同意与额度流程；可能消耗转写额度。900句匹配原文，不评价发音。可跳过。', target: 'workbench' },
  { id: 'finish', title: '结束这次学习', description: '点击底部「结束」，保存本次记录，再看看刚才留下的积累。', target: 'finish' },
  { id: 'recap', title: '从回顾回到原题', description: '点开「标注题目」或「全部学习记录」，再打开 Sentence1。查过的词也在「查词与收藏」中。', target: 'recap' },
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
