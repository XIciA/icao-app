export const STUDY_GUIDE_CARD = 'sentence900-main-001';
/** Shared capability definitions. No example bank, word or card is embedded here. */
export const TUTORIAL_STEPS = [
  { id: 'play', title: '先听一遍', description: '点播放，听一遍当前题目。', target: 'audio' },
  { id: 'reveal', title: '展开原文与答案', description: '点这里，查看原文和翻译。', target: 'answer' },
  { id: 'highlight', title: '标记你的重点', description: '开启高亮，再选中原文中想记住的词。', target: 'highlight' },
  { id: 'tag', title: '给题目加个标签', description: '选择一个适合这道题的标签。', target: 'tag' },
  { id: 'note', title: '留下学习笔记', description: '记下一个要点，再点完成。', target: 'workbench' },
  { id: 'lookup', title: '读懂一个词', description: '长按原文中的英文词，查看释义。', target: 'text' },
  { id: 'favorite', title: '把生词留下来', description: '点亮星标，收入你的词本。', target: 'favorite' },
  { id: 'record', title: '试着读出来', description: '点录音，读完后再点一次结束。', target: 'audio' },
  { id: 'review', title: '看看学习反馈', description: '点 AI 评分，查看本次作答的反馈。', target: 'workbench' },
  { id: 'finish', title: '保存本次学习', description: '点击结束，保存本次学习并查看积累。', target: 'finish' },
  { id: 'recap', title: '找回刚才的积累', description: '点开本次回顾，找回刚才的题目和学习积累。', target: 'recap' },
] as const;
export type TutorialStepId = typeof TUTORIAL_STEPS[number]['id'];
export type TutorialTargetId = typeof TUTORIAL_STEPS[number]['target'] | 'finish';
export const studyStepId = (id: TutorialStepId) => `study-${id}`;
