import { TUTORIAL_STEPS, studyStepId } from './tutorial-model';

export const GUIDE_ENTRIES = [
  { id: 'study', title: '题库学习', description: '从900句第一句体验真实学习', route: '/(tabs)' },
  { id: 'vocab', title: '单词学习', description: '选词书、学单词、了解掌握情况', route: '/content/vocab' },
  { id: 'radio', title: '随身听', description: '按自己的节奏，随时听练', route: '/content/radio' },
  { id: 'hotspot', title: 'OPI 热点', description: '看热点内容，进入相关练习', route: '/content/hotspot' },
  { id: 'resources', title: '资源分享', description: '查找并阅读备考资料', route: '/content/resources' },
  { id: 'mock-exam', title: '模拟练习', description: '选择板块，体验模拟作答', route: '/content/mock-exam' },
  { id: 'records', title: '回顾学习记录', description: '回看学过的题目和作答', route: '/learning-records' },
  { id: 'recap', title: '回顾我的标注', description: '找回高亮、标签和笔记', route: '/annotations' },
  { id: 'export', title: '900句导出', description: '把学习积累整理成 PDF', route: '/question-bank/sentences900' },
] as const;
export type GuideId = typeof GUIDE_ENTRIES[number]['id'];
export type GuideStep = { id: string; text: string; title?: string; target?: string; read?: boolean };
export const GUIDE_FLOWS: Partial<Record<GuideId, GuideStep[]>> = {
  study: TUTORIAL_STEPS.map(step => ({ id: studyStepId(step.id), title: step.title, text: step.description, read: step.id === 'recap', target: ({ play: 'sentence-play', highlight: 'sentence-highlight-tool', tag: 'sentence-tag-tool', note: 'sentence-note', record: 'sentence-record', review: 'sentence-review' } as Record<string, string>)[step.id] ?? `sentence-${step.target}` })),
  radio: [
    { id: 'radio-bank', text: '在这里切换要收听的题库。' },
    { id: 'radio-order', text: '可切换顺序、随机或单曲循环，也可保留当前模式。', read: true },
    { id: 'radio-speed', text: '调整播放速度，也可以保留当前速度。', read: true },
    { id: 'radio-interval', text: '调整每段之间的停顿，留出跟读时间。' },
    { id: 'radio-subtitle', text: '选择字幕显示方式，也可以保留当前设置。', read: true },
    { id: 'radio-play', text: '设置好了，点击播放按钮开始听。' },
    { id: 'radio-study', text: '点击曲目标题，打开对应题目深入练习。' },
  ],
  vocab: [
    { id: 'vocab-book', text: '选择至少一本词书，可以组合选择。', read: true },
    { id: 'vocab-start', text: '点击「开始学习」，学习所选词书。' },
    { id: 'vocab-speech', text: '点击发音按钮，听听这个词。' },
    { id: 'vocab-rating', text: '按实际情况，选择你的熟悉程度。' },
    { id: 'vocab-meaning', text: '结合释义和例句，理解它的用法。', read: true },
    { id: 'vocab-favorite', text: '点亮星标，和题库查词共用一个词本。' },
    { id: 'vocab-next', text: '继续下一词；回到词书首页还可以体验词汇测评。', read: true },
  ],
  hotspot: [
    { id: 'hotspot-topic', text: '选择一期热点，查看对应考点和问题。' },
  ],
  resources: [
    { id: 'resource-open', text: '点开一份资料看看。' },
  ],
  'mock-exam': [
    { id: 'mock-type', text: '选择考试类型，也可以保留当前选择。', read: true },
    { id: 'mock-scope', text: '选好练习板块，至少保留一个；也可保留当前选择。', read: true },
    { id: 'mock-start', text: '点击下方的开始练习按钮，也可先完成引导。', read: true },
  ],
  records: [{ id: 'recap-record', text: '点开一次学习记录，回看当时的题目和作答。' }],
  recap: [
    { id: 'recap-filter', text: '切换标签、高亮或笔记，按题库和标记查找。', read: true },
    { id: 'recap-question', text: '点题目，可以带着原标注继续学习。' },
  ],
  export: [
    { id: 'export-open', text: '点击右上角的导出，整理你的900句学习资料。' },
    { id: 'export-levels', text: '选择导出等级，也可以保留当前范围。', read: true },
    { id: 'export-scope', text: '选择全部、已学习或有标注句子，也可保留当前选择。', read: true },
    { id: 'export-translation', text: '按需要决定是否包含中文翻译。', read: true },
    { id: 'export-personal', text: '可以把高亮、标签和笔记一起带走。', read: true },
    { id: 'export-generate', text: '点击「生成 PDF」；生成成功后完成这一步。' },
  ],
};
