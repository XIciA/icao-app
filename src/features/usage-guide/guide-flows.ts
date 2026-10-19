export const GUIDE_ENTRIES = [
  { id: 'study', title: '题库学习', description: '用 Sentence1 体验一次完整学习', route: '/info/tutorial' },
  { id: 'vocab', title: '单词学习', description: '选词书、学单词、了解掌握情况', route: '/content/vocab' },
  { id: 'radio', title: '随身听', description: '按自己的节奏，随时听练', route: '/content/radio' },
  { id: 'hotspot', title: 'OPI 热点', description: '看热点内容，进入相关练习', route: '/content/hotspot' },
  { id: 'resources', title: '资源分享', description: '查找并阅读备考资料', route: '/content/resources' },
  { id: 'mock-exam', title: '模拟练习', description: '选择板块，体验模拟作答', route: '/content/mock-exam' },
  { id: 'recap', title: '标注与回顾', description: '找回重点、笔记和学习记录', route: '/annotations' },
  { id: 'export', title: '900句导出', description: '把学习积累整理成 PDF', route: '/info/guide?export=1' },
] as const;
export type GuideId = typeof GUIDE_ENTRIES[number]['id'];
export type GuideStep = { id: string; text: string; read?: boolean };
export const GUIDE_FLOWS: Partial<Record<GuideId, GuideStep[]>> = {
  radio: [
    { id: 'radio-bank', text: '在这里切换900句、听力或故事复述。' },
    { id: 'radio-order', text: '试着切换顺序、随机或单曲循环。' },
    { id: 'radio-speed', text: '选一个听起来舒服的速度。' },
    { id: 'radio-interval', text: '调整每段之间的停顿，留出跟读时间。' },
    { id: 'radio-subtitle', text: '切换字幕，选择适合你的听练方式。' },
    { id: 'radio-play', text: '设置好了，点击播放按钮开始听。' },
    { id: 'radio-study', text: '点击曲目标题，打开对应题目深入练习。' },
  ],
  vocab: [
    { id: 'vocab-book', text: '选择想学的词书，可以组合选择。' },
    { id: 'vocab-start', text: '点击「开始学习」，学习所选词书。' },
    { id: 'vocab-speech', text: '点击发音按钮，听听这个词。' },
    { id: 'vocab-rating', text: '按实际情况，选择你的熟悉程度。' },
    { id: 'vocab-meaning', text: '结合释义和例句，理解它的用法。', read: true },
    { id: 'vocab-favorite', text: '点亮星标，和题库查词共用一个词本。' },
    { id: 'vocab-test', text: '返回词书首页，可从这里开始词汇测评。', read: true },
  ],
  hotspot: [
    { id: 'hotspot-topic', text: '选一个感兴趣的话题。' },
    { id: 'hotspot-article', text: '在这里了解话题内容和相关表达。', read: true },
    { id: 'hotspot-study', text: '点击「开始学习」，进入相关题目。' },
  ],
  resources: [
    { id: 'resource-filter', text: '在这里浏览航空英语备考方法和学习资料。', read: true },
    { id: 'resource-open', text: '点开一份资料看看。' },
    { id: 'resource-article', text: '在这里阅读完整内容。', read: true },
  ],
  'mock-exam': [
    { id: 'mock-type', text: '先选择你要练习的考试类型。' },
    { id: 'mock-scope', text: '可以完整练习，也可以选择部分板块。' },
    { id: 'mock-start', text: '准备好后，从这里开始模拟，也可以先完成教程。', read: true },
  ],
  recap: [
    { id: 'recap-filter', text: '高亮、标签和笔记都在这里，可按标签筛选。', read: true },
    { id: 'recap-question', text: '点题目，可以带着原标注继续学习。' },
    { id: 'recap-records', text: '返回“我的 → 学习记录”，查看练习回顾。', read: true },
    { id: 'recap-record', text: '点开一条记录，再从回顾中返回对应题目。' },
  ],
  export: [
    { id: 'export-scope', text: '先选要整理的句子范围。' },
    { id: 'export-translation', text: '按需要决定是否包含中文翻译。', read: true },
    { id: 'export-personal', text: '可以把高亮、标签和笔记一起带走。', read: true },
    { id: 'export-generate', text: '点击「生成 PDF」；生成成功后完成这一步。' },
  ],
};
