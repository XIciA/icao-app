export type WebCourseViewId =
  | 'icao4-initial'
  | 'icao4-retake'
  | 'icao4-preview'
  | 'assessment'
  | 'icao5';

export type WebCourseOutlineSection = {
  title: string;
  items: readonly string[];
};

export type WebCoursePlan = {
  id: string;
  name: string;
  price: string;
  unit: string;
  description: string;
  detailIntro?: string;
  detailLabel?: string;
  popular?: boolean;
  outline?: readonly WebCourseOutlineSection[];
  privileges?: readonly WebCourseOutlineSection[];
};

export type WebCourseView = {
  id: WebCourseViewId;
  label: string;
  title: string;
  description: string;
  plans: readonly WebCoursePlan[];
};

const guaranteedIntro =
  '包过班将集中投入教师资源，围绕学员基础与考试安排持续调整教学。备考期间课程不限次数，团队持续承担教学与复盘任务直至学员通过；同时结合近期考试反馈与高频题型更新训练重点，帮助学员以更高效、更稳定的节奏冲刺目标等级。';

const previewIntro =
  '适合尚未下分院、希望提前预习 ICAO 英语并打好基础的学员。由专业 ICAO 5 级教师分享备考经验和航校运行经验，结合实际运行场景提升英语能力，为后续下分院做好准备。';

const guaranteedPrivileges = [
  {
    title: '免费测试',
    items: ['赠送2节高质量模拟测试课程，为学员学习进度把关，构建最高效率的复习方向'],
  },
  {
    title: '负责到底',
    items: ['未能通过考试则永久免费提供课程服务直到学员通过考试'],
  },
  {
    title: '多对一授课',
    items: ['最大限度倾斜教师资源，多名高级教师共同完成教学，保证最优质服务，尽最大努力为学员通过考试保驾护航'],
  },
  {
    title: '教师团队配置',
    items: [
      '1名ICAO5级授课教师：负责整个学习备考过程中所有课程教学与作业安排',
      '1名ICAO5级助课教师：与授课教师共同把握学员进度与作业质量，保证提供最适合学员自身情况的授课内容与作业；负责进行学员的模拟测试课程，通过学员的能力实时调整授课内容与学员备考方向',
      '1名班主任：负责进行日常排课安排与时间调整，保证学员有充足的时间完成课上内容；实时收取学员需求与建议，真正做到个性化定制课程安排',
    ],
  },
] as const;

const icao4InitialFoundationOutline = [
  {
    title: '测评与备考规划',
    items: ['基础水平测试与学习备考规划', 'ICAO考试结构与评分标准讲解分析', '听力深度测试 基础语感与输入能力构建'],
  },
  {
    title: '900句',
    items: ['学习技巧与速记体系养成', '长难句子解析，情景意识构建', '精准模拟测评 考试技巧分享'],
  },
  {
    title: '陆空通话',
    items: ['正常流程讲解 基本题目结构介绍', '重点答题技巧与知识点讲解 经典题目练习与解析'],
  },
  {
    title: 'OPI',
    items: [
      '答题思路与角度详细讲解',
      '重难点话题集中讲解与练习 语音语调纠正 结构与逻辑提高',
      '热点话题分享与备考',
      '听不懂问题专项练习',
      '深度模拟测试 应试技巧讲解',
      '考试技巧分享与考前注意事项',
    ],
  },
] as const;

const icao4GuaranteedOutline = [
  {
    title: '测评与专属规划',
    items: [
      '基础水平测试与学习备考规划',
      'ICAO考试结构与评分标准讲解分析',
      '听力深度测试 基础语感与输入能力构建',
      '基础航空英语词汇测试与积累',
      '规划学习方案 制定专属学习方向与目标',
    ],
  },
  {
    title: '900句',
    items: ['学习技巧与速记体系养成', '长难句子解析，情景意识构建', '精准模拟测评 考试技巧分享'],
  },
  {
    title: '陆空通话',
    items: ['正常流程讲解 基本题目结构介绍', '重点答题技巧与知识点讲解 经典题目练习与解析', '特情题目回答技巧与专项练习'],
  },
  {
    title: 'OPI',
    items: [
      '基础语言体系的构建',
      '答题思路详细讲解',
      '重难点话题集中讲解与练习 语音语调纠正 结构与逻辑提高',
      '热点话题分享与备考',
      '听不懂问题专项练习',
      '深度模拟测试 应试技巧讲解',
      '考试技巧分享与考前注意事项',
    ],
  },
] as const;

const icao4IntensiveOutline = [
  { title: '基础规划', items: ['基础水平测试与学习备考规划'] },
  { title: '900句', items: ['学习技巧与速记体系养成'] },
  { title: '陆空通话', items: ['重点知识点讲解与经典题目练习', '特情热点问题分享与重点练习'] },
  {
    title: 'OPI',
    items: ['基础语言体系与思路粗略构建', '重难点话题集中练习 语音语调纠正 结构与逻辑提高', '热点话题分享与备考模拟测试'],
  },
] as const;

const icao5FoundationOutline = [
  {
    title: '测评与备考规划',
    items: ['基础水平测试与学习备考规划', 'ICAO5考试结构与评分标准讲解分析', '听力深度测试 基础语感与输入能力构建', '基础航空英语词汇测试与积累'],
  },
  {
    title: '900句',
    items: ['学习技巧与速记体系养成', '长难句子解析，情景意识构建', '精准模拟测评 考试技巧分享'],
  },
  {
    title: '陆空通话',
    items: ['正常流程讲解 基本题目结构介绍', '重点答题技巧与知识点讲解 经典题目练习与解析'],
  },
  {
    title: '故事复述',
    items: ['输入能力的培养与速记能力构建', '表达能力提升', '热点内部题库分享', '经典题目练习与解析', '答题技巧与做题节奏'],
  },
  {
    title: 'OPI',
    items: ['基础语言体系与答题思路详细讲解与构建', '重难点话题集中讲解与练习 语音语调纠正 结构与逻辑提高', '热点话题分享与备考', '听不懂问题专项练习', '深度模拟测试', '考试技巧分享与考前注意事项'],
  },
] as const;

const icao5IntensiveOutline = [
  {
    title: '测评与备考规划',
    items: ['基础水平测试与学习备考规划', 'ICAO5考试结构与评分标准讲解分析', '听力深度测试 基础语感与输入能力构建'],
  },
  { title: '900句', items: ['长难句子解析，情景意识构建', '精准模拟测评 考试技巧分享'] },
  { title: '陆空通话', items: ['重点答题技巧与知识点讲解 经典题目练习与解析'] },
  { title: '故事复述', items: ['表达能力提升', '热点内部题库分享', '经典题目练习与解析', '答题技巧与做题节奏'] },
  {
    title: 'OPI',
    items: ['重难点话题集中讲解与练习 语音语调纠正 结构与逻辑提高', '热点话题分享与备考', '听不懂问题专项练习', '深度模拟测试', '考试技巧分享与考前注意事项'],
  },
] as const;

export const webCoursePromoCatalog = {
  source: {
    url: 'https://feizhuicao.com/promo',
    syncedAt: '2026-08-10',
    liveHtmlSha256: 'c4702c2cade8a239e60325612afa26f1f7d911fa587d29a6150614e10fd256e8',
  },
  hero: {
    eyebrow: 'CURRICULUM SYSTEM',
    title: '飞猪 ICAO 体系课程',
    description: '团队全员由icao5在职飞行员组成，打造完整 ICAO 备考体系——以超高通过率、个性化定制与全程一对一教学，陪你稳稳拿下目标等级。',
    destinations: [
      { id: 'icao4', title: 'ICAO 4 课程', description: '初考、复考、预习与专项培训', viewId: 'icao4-initial' },
      { id: 'icao5', title: 'ICAO 5 课程', description: '冲刺、基础与包过班', viewId: 'icao5' },
      { id: 'advantages', title: '核心优势', description: '通过率、个性化与在职飞行员教学' },
    ],
  },
  advantages: {
    eyebrow: 'WHY CHOOSE US',
    title: '核心优势',
    description: '四大维度，让每一分备考投入都物超所值。',
    items: [
      { id: 'pass-rate', title: '超高通过率', description: 'ICAO 4 初考通过率 95%+，复考通过率 92%+，ICAO 5 通过率 90%+。', icon: 'trend' },
      { id: 'customization', title: '超个性化定制', description: '课上讲什么听你安排。根据模拟测试量身定制方案，上课周期与时间完全按照学生安排。', icon: 'target' },
      { id: 'experience', title: '超多经验分享', description: '团队全员由icao5在职飞行员组成，对痛点感同身受。掌握各考点一手参考资料及 OPI 热点话题。', icon: 'users' },
      { id: 'value', title: '超高性价比', description: '亲历市面各大机构培训，承诺打造全平台最低价。花钱买时间，用节约的时间赚回更多。', icon: 'shield' },
    ],
  },
  pricing: {
    eyebrow: 'COURSES & PRICING',
    standardOutlineNotice: '此为标准课程内容安排大纲。为更好地提供高质量教学，具体课上内容会根据学员实际英语水平差距与真实需求实时更新，并与学员共同商讨决定，做到真正的“因材施教”。',
    detailFooterNote: '课程内容会根据你的基础、目标等级与备考周期进行微调。',
    tabViewIds: ['icao4-initial', 'icao4-retake', 'icao4-preview', 'assessment'],
    views: {
      'icao4-initial': {
        id: 'icao4-initial',
        label: '初考课程',
        title: 'ICAO 4 初考课程',
        description: '冲刺班、基础班与包过班，按基础与备考节奏选择。',
        plans: [
          {
            id: 'icao4-initial-foundation',
            name: 'ICAO 4 初考基础班',
            price: '4500',
            unit: '元 / 15 节课 + 2 次模拟测试',
            description: '适合英语基础薄弱，或有 ICAO 考试未通过经历、需系统打基础的学员。',
            outline: icao4InitialFoundationOutline,
          },
          {
            id: 'icao4-initial-guaranteed',
            name: 'ICAO 4 初考包过班',
            price: '5999',
            unit: '元 / 无限课时',
            description: '备考期间课程不限次数，团队持续承担教学与复盘任务直至学员通过。',
            detailIntro: guaranteedIntro,
            detailLabel: '课程介绍',
            popular: true,
            outline: icao4GuaranteedOutline,
            privileges: guaranteedPrivileges,
          },
          {
            id: 'icao4-initial-intensive',
            name: 'ICAO 4 初考冲刺班',
            price: '3600',
            unit: '元 / 12 节课 + 1 次模拟测试',
            description: '适合备考时间紧张但有一定英语基础，需在陆空通话特情题与 OPI 答题上再精进的学员。',
            outline: icao4IntensiveOutline,
          },
        ],
      },
      'icao4-retake': {
        id: 'icao4-retake',
        label: '复考课程',
        title: 'ICAO 4 复考课程',
        description: '仅针对考试第 3、4 部分，聚焦陆空通话、OPI 与学习规划。',
        plans: [
          {
            id: 'icao4-retake-foundation',
            name: 'ICAO 4 复考基础班',
            price: '3600',
            unit: '元 / 12 节课 + 2 次模拟测试',
            description: '适合英语基础薄弱，或有 ICAO 考试未通过经历、需系统打基础的学员。',
            outline: [
              { title: '测评与备考规划', items: ['基础水平测试与学习备考规划'] },
              icao4InitialFoundationOutline[2],
              icao4InitialFoundationOutline[3],
            ],
          },
          {
            id: 'icao4-retake-guaranteed',
            name: 'ICAO 4 复考包过班',
            price: '4999',
            unit: '元 / 无限课时',
            description: '备考期间课程不限次数，团队持续承担教学与复盘任务直至学员通过。',
            detailIntro: guaranteedIntro,
            detailLabel: '课程介绍',
            popular: true,
            outline: [
              { title: '测评与专属规划', items: ['基础水平测试与学习备考规划', '规划学习方案 制定专属学习方向与目标'] },
              icao4GuaranteedOutline[2],
              icao4GuaranteedOutline[3],
            ],
            privileges: guaranteedPrivileges,
          },
          {
            id: 'icao4-retake-intensive',
            name: 'ICAO 4 复考冲刺班',
            price: '2400',
            unit: '元 / 8 节课 + 1 次模拟测试',
            description: '适合备考时间紧张但有一定英语基础，需在陆空通话特情题与 OPI 答题上再精进的学员。',
            outline: [icao4IntensiveOutline[0], icao4IntensiveOutline[2], icao4IntensiveOutline[3]],
          },
        ],
      },
      'icao4-preview': {
        id: 'icao4-preview',
        label: '预习课程',
        title: 'ICAO 4 预习课程',
        description: previewIntro,
        plans: [
          {
            id: 'icao4-preview',
            name: 'ICAO 4 预习课程',
            price: '3000',
            unit: '元 / 12 节课',
            description: previewIntro,
            detailIntro: previewIntro,
            detailLabel: '课程介绍',
          },
        ],
      },
      assessment: {
        id: 'assessment',
        label: '专项培训',
        title: 'ICAO 专项培训',
        description: '通过专项模拟与全板块模拟定位问题，规划后续备考方向。',
        plans: [
          {
            id: 'opi-assessment',
            name: 'OPI 专项深测',
            price: '400',
            unit: '元 / 2 课时',
            description: '针对 OPI 板块进行模拟考试对练，纠正问题、建议方向、预测通过率并分享热点话题。',
            outline: [{ title: 'OPI专项深测', items: ['深度还原考试节奏，考前全真模拟测试', '检测OPI弱点并针对性解决', '真实反馈通过率', '分享近期热点话题', '规划备考方向'] }],
          },
          {
            id: 'full-assessment',
            name: '全板块深测',
            price: '400',
            unit: '元 / 2 课时',
            description: '针对 ICAO 考试所有板块进行模拟考试练习，纠正问题、建议方向及预测通过率。',
            outline: [{ title: '全板块模拟', items: ['模拟真实考试节奏与难度', '检查各部分弱点并针对性解决', '考前经验分享', '规划备考方向'] }],
          },
        ],
      },
      icao5: {
        id: 'icao5',
        label: 'ICAO 5 课程',
        title: 'ICAO 5 课程',
        description: '冲刺班、基础班与包过班，按基础与备考节奏选择。',
        plans: [
          {
            id: 'icao5-foundation',
            name: 'ICAO 5 基础班',
            price: '5400',
            unit: '元 / 18 节课 + 3 次模拟测试',
            description: '适合已通过 ICAO 4、自身英语基础较好，但对 ICAO 5 的学习仍存在一定困难的同学。',
            outline: icao5FoundationOutline,
          },
          {
            id: 'icao5-guaranteed',
            name: 'ICAO 5 包过班',
            price: '7999',
            unit: '元 / 无限课时',
            description: '备考期间课程不限次数，团队持续承担教学与复盘任务直至学员通过。',
            detailIntro: guaranteedIntro,
            detailLabel: '课程介绍',
            popular: true,
            privileges: guaranteedPrivileges,
          },
          {
            id: 'icao5-intensive',
            name: 'ICAO 5 冲刺班',
            price: '4500',
            unit: '元 / 12 节课 + 1 次模拟测试',
            description: '适合自身英语能力过硬，已经处在icao5复习的阶段之中，或有过icao5考试经验的同学。',
            outline: icao5IntensiveOutline,
          },
        ],
      },
    } satisfies Record<WebCourseViewId, WebCourseView>,
  },
  story: {
    eyebrow: 'OUR STORY',
    title: '关于飞猪 ICAO 与我们的初衷',
    description: '从同路人出发，为每一位飞行同僚撑一把伞。',
    dialogTitle: '我们有话说',
    dialogDescription: '关于飞猪 ICAO、我们的初衷，以及我们想为飞行同僚做的事。',
    paragraphs: [
      '飞猪 ICAO 培训由一群同样从航校走出来的飞行同事们成立，目前已帮助超过 100 名学员顺利通过 ICAO 考试。自己淋过雨，希望能给大家撑把伞。我们志在为所有飞行同僚提供最负责、最低价、最高效、最专业的 ICAO 培训服务。',
      '我们深知，目前市场上的 ICAO 培训与大家之间存在巨大的信息差。我们真实参与过、了解过：ICAO 培训价格高、责任低、教师专业性不足；加上现阶段 ICAO 考试改革，学习资料难找，学员备考没有方向……正是因为市场有需求、大家有痛点，才有了飞猪 ICAO。讲心里话，对于我们自身而言，我们宁愿 1 个学员赚 1 块，赚 100 个人的钱；也不愿 1 个学员赚 100，只赚 1 个人的钱。因为我们很清楚，目前市场上的 ICAO 培训存在严重溢价。摸着良心挣该挣的钱，用我们所擅长的事情帮助更多人，是我们的初衷。',
      '我们的教师团队全部拥有 ICAO 5 级资质，每名教师都经历过严格的培训与筛选，经验丰富、认真负责。我们承诺，会用心负责地对待每一位同事兄弟，尽所有可能帮助大家顺利通过考试，满足大家的需求、听取大家的建议。我们希望有朝一日，行业内所有人面对 ICAO 初考、复训时，不再把它视为头疼的难关、飞行生涯的绊脚石。',
      '针对 ICAO 考试，其实没有大家想象中那么难。我们相信，只要每个人投入足够多的时间，都可以顺利通过。但有我们的帮助，一定能够获得更清晰的学习方向，大幅提高备考效率，把时间花在刀刃上，用更短的时间、更稳定地通过考试——这就是您花钱的意义所在。',
    ],
    quote: '最后，愿每位飞行同僚都能在自己的生涯道路上披荆斩棘，我们自会顶峰相见！',
    footer: '让每一次投入，都更有方向。',
  },
  contact: {
    label: '咨询请添加微信',
    wechatIds: ['15736231388', '17367473982'],
    brand: '飞猪 ICAO',
    footer: '© 2026 飞猪 ICAO 英语培训团队 · 在职飞行员一对一线上教学',
  },
} as const;
