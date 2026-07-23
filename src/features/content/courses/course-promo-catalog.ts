export type CourseMetricIcon = 'trend' | 'layers' | 'plane';
export type CourseAdvantageIcon = 'trend' | 'target' | 'users' | 'shield';

export type CoursePromoMetric = {
  id: string;
  icon: CourseMetricIcon;
  value: string;
  label: string;
};

export type CoursePromoAdvantage = {
  id: string;
  icon: CourseAdvantageIcon;
  title: string;
  description: string;
};

export type CourseOutlineSection = {
  id: string;
  title: string;
  items: readonly string[];
};

export type CoursePlan = {
  id: string;
  name: string;
  price: string;
  unit: string;
  period?: string;
  description: string;
  badge?: string;
  popular?: boolean;
  outline: readonly CourseOutlineSection[];
  privileges?: readonly CourseOutlineSection[];
};

export type CourseCategory = {
  id: 'summer' | 'icao4' | 'icao5' | 'assessment';
  label: string;
  plans: readonly CoursePlan[];
};

export type CoursePromoCatalog = {
  source: {
    url: string;
    syncedAt: string;
    sha256: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    primaryAction: string;
    secondaryAction: string;
  };
  metrics: readonly CoursePromoMetric[];
  advantages: {
    eyebrow: string;
    title: string;
    description: string;
    items: readonly CoursePromoAdvantage[];
  };
  pricing: {
    eyebrow: string;
    title: string;
    description: string;
    categories: readonly CourseCategory[];
    standardOutlineNotice: string;
    detailFooterNote: string;
  };
  contact: {
    quote: string;
    label: string;
    wechatIds: readonly string[];
    footer: string;
  };
};

export const coursePromoCatalog = {
  source: {
    url: 'https://feizhuicao.com/promo',
    syncedAt: '2026-07-23',
    sha256: '823694bda130d2c067cbf2f65cbda2c54b7a8decb16331bc15a94ffa3b3b9246',
  },
  hero: {
    eyebrow: 'CURRICULUM SYSTEM',
    title: '飞猪 ICAO 体系课程',
    description: '团队全员由icao5在职飞行员组成，打造完整 ICAO 备考体系——以超高通过率、个性化定制与全程一对一教学，陪你稳稳拿下目标等级。',
    primaryAction: '查看培训模式',
    secondaryAction: '了解核心优势',
  },
  metrics: [
    {
      id: 'pass-rate',
      icon: 'trend',
      value: '90%+ / 100%',
      label: 'ICAO 4 初考通过率 90%+，复考及 ICAO 5 初考达 100%',
    },
    {
      id: 'course-count',
      icon: 'layers',
      value: '7 大课程',
      label: '从 ICAO 4 备考到 ICAO 5 进阶，分层进阶全覆盖',
    },
    {
      id: 'teaching-mode',
      icon: 'plane',
      value: '1 对 1',
      label: '在职飞行员教师团队，全程一对一线上教学',
    },
  ],
  advantages: {
    eyebrow: 'WHY CHOOSE US',
    title: '核心优势',
    description: '四大维度，让每一分备考投入都物超所值。',
    items: [
      {
        id: 'pass-rate',
        icon: 'trend',
        title: '超高通过率',
        description: 'ICAO 4 初考学员通过率 90%+；ICAO 4 复考及 ICAO 5 初考学员通过率均达 100%。',
      },
      {
        id: 'customization',
        icon: 'target',
        title: '超个性化定制',
        description: '课上讲什么听你安排。根据模拟测试量身定制方案，上课周期与时间完全按照学生安排。',
      },
      {
        id: 'experience',
        icon: 'users',
        title: '超多经验分享',
        description: '团队全员由icao5在职飞行员组成，对痛点感同身受。掌握各考点一手参考资料及 OPI 热点话题。',
      },
      {
        id: 'value',
        icon: 'shield',
        title: '超高性价比',
        description: '亲历市面各大机构培训，承诺打造全平台最低价。花钱买时间，用节约的时间赚回更多。',
      },
    ],
  },
  pricing: {
    eyebrow: 'COURSES & PRICING',
    title: '培训模式',
    description: '暑期小班与分层课程透明定价，按需选择最适合你的备考节奏。',
    standardOutlineNotice: '此为标准课程内容安排大纲。为更好地提供高质量教学，具体课上内容会根据学员实际英语水平差距与真实需求实时更新，并与学员共同商讨决定，做到真正的“因材施教”。',
    detailFooterNote: '课程内容会根据你的基础、目标等级与备考周期进行微调。',
    categories: [
      {
        id: 'summer',
        label: '暑期小班',
        plans: [
          {
            id: 'summer-foundation',
            name: '暑期特价小班基础班',
            price: '3000',
            unit: '元 / 15 课时',
            period: '7月16日 / 8月1日开班',
            description: '适合英语基础较弱，或还没有 ICAO 考试经历，需要从基础知识开始逐步学习提高的同学。线上小班授课，最多 5 人。',
            badge: '热门暑期班',
            outline: [
              {
                id: 'service',
                title: '小班服务',
                items: ['线上一对多授课', 'ICAO 5 教师教学', '随时打断提问', '课下每日作业布置与监督'],
              },
              {
                id: 'schedule',
                title: '班级安排',
                items: ['基础1班：7月16日-7月30日', '基础2班：8月1日-8月15日', '班级人数：最多5人'],
              },
              {
                id: 'curriculum',
                title: '课程安排',
                items: [
                  '基础ICAO考试介绍与学习备考规划',
                  '900句学习技巧与速记体系养成',
                  '陆空通话基本题目结构介绍 正常流程讲解 答题原则讲解',
                  '陆空通话重点答题技巧与知识点讲解 经典题目练习与解析1',
                  '陆空通话重点答题技巧与知识点讲解 经典题目练习与解析2',
                  'OPI基础知识点讲解1',
                  'OPI基础知识点讲解2',
                  'OPI答题思路与角度详细讲解1',
                  'OPI答题思路与角度详细讲解2',
                  'OPI答题思路与角度详细讲解3',
                  '900句长难句解析与情景意识的构建',
                  'OPI语音语调纠正 结构与逻辑提高',
                  'OPI重难点话题集中讲解与练习',
                  'OPI重难点话题集中讲解与练习2',
                  'OPI热点话题分享与备考',
                ],
              },
            ],
          },
          {
            id: 'summer-advanced',
            name: '暑期特价小班进阶班',
            price: '2000',
            unit: '元 / 10 课时',
            period: '7月16日 / 8月1日开班',
            description: '适合有一定英语基础或考试经历，需要集中完善难点问题、提升答题质量的同学。线上小班授课，最多 8 人。',
            badge: '热门暑期班',
            outline: [
              {
                id: 'service',
                title: '小班服务',
                items: ['线上一对多授课', 'ICAO 5 教师教学', '随时打断提问', '课下每日作业布置与监督'],
              },
              {
                id: 'schedule',
                title: '班级安排',
                items: ['进阶1班：7月16日-7月26日', '进阶2班：8月1日-8月10日', '班级人数：最多8人'],
              },
              {
                id: 'curriculum',
                title: '课程安排',
                items: [
                  '基础ICAO考试介绍与学习备考规划',
                  '900句学习技巧与速记体系养成',
                  '陆空通话基本题目结构介绍 正常流程讲解 答题原则讲解',
                  '陆空通话重点答题技巧与知识点讲解 经典题目练习与解析1',
                  '陆空通话重点答题技巧与知识点讲解 经典题目练习与解析2',
                  'OPI基础知识点讲解1',
                  'OPI基础知识点讲解2',
                  'OPI答题思路与角度详细讲解1',
                  'OPI答题思路与角度详细讲解2',
                  '重难点话题集中讲解与练习',
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'icao4',
        label: 'ICAO 4 备考',
        plans: [
          {
            id: 'icao4-foundation',
            name: 'ICAO 4 基础班',
            price: '3300',
            unit: '元 / 12 课时',
            period: '周期约 20 天',
            description: '适合英语基础薄弱，或有 ICAO 考试未通过经历、需系统打基础的学员。',
            outline: [
              {
                id: 'assessment',
                title: '测评与备考规划',
                items: ['基础水平测试与学习备考规划', 'ICAO考试结构与评分标准讲解分析', '听力深度测试 基础语感与输入能力构建'],
              },
              {
                id: 'sentence-900',
                title: '900句',
                items: ['学习技巧与速记体系养成', '长难句子解析，情景意识构建', '精准模拟测评 考试技巧分享'],
              },
              {
                id: 'radiotelephony',
                title: '陆空通话',
                items: ['正常流程讲解 基本题目结构介绍', '重点答题技巧与知识点讲解 经典题目练习与解析'],
              },
              {
                id: 'opi',
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
            ],
          },
          {
            id: 'icao4-guaranteed',
            name: 'ICAO 4 包过班',
            price: '4999',
            unit: '元 / 15 课时',
            period: '周期约 30 天',
            description: '挂不起的兄弟无脑冲。无论英语基础如何，私人定制课程；若未通过，提供永久、免费的教学直至通过。',
            popular: true,
            outline: [
              {
                id: 'assessment',
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
                id: 'sentence-900',
                title: '900句',
                items: ['学习技巧与速记体系养成', '长难句子解析，情景意识构建', '精准模拟测评 考试技巧分享'],
              },
              {
                id: 'radiotelephony',
                title: '陆空通话',
                items: ['正常流程讲解 基本题目结构介绍', '重点答题技巧与知识点讲解 经典题目练习与解析', '特情题目回答技巧与专项练习'],
              },
              {
                id: 'opi',
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
            ],
            privileges: [
              {
                id: 'free-assessment',
                title: '免费测试',
                items: ['赠送2节高质量模拟测试课程，为学员学习进度把关，构建最高效率的复习方向'],
              },
              {
                id: 'guarantee',
                title: '负责到底',
                items: ['未能通过考试则永久免费提供课程服务直到学员通过考试'],
              },
              {
                id: 'multi-teacher',
                title: '多对一授课',
                items: ['最大限度倾斜教师资源，多名高级教师共同完成教学，保证最优质服务，尽最大努力为学员通过考试保驾护航'],
              },
              {
                id: 'teachers',
                title: '教师团队配置',
                items: [
                  '1名ICAO5级授课教师：负责整个学习备考过程中所有课程教学与作业安排',
                  '1名ICAO5级助课教师：与授课教师共同把握学员进度与作业质量，保证提供最适合学员自身情况的授课内容与作业；负责进行学员的模拟测试课程，通过学员的能力实时调整授课内容与学员备考方向',
                  '1名班主任：负责进行日常排课安排与时间调整，保证学员有充足的时间完成课上内容；实时收取学员需求与建议，真正做到个性化定制课程安排',
                ],
              },
            ],
          },
          {
            id: 'icao4-intensive',
            name: 'ICAO 4 冲刺班',
            price: '2300',
            unit: '元 / 8 课时',
            period: '周期 10-12 天',
            description: '适合备考时间紧张但有一定英语基础，需在陆空通话特情题与 OPI 答题上再精进的学员。',
            outline: [
              {
                id: 'planning',
                title: '基础规划',
                items: ['基础水平测试与学习备考规划'],
              },
              {
                id: 'sentence-900',
                title: '900句',
                items: ['学习技巧与速记体系养成'],
              },
              {
                id: 'radiotelephony',
                title: '陆空通话',
                items: ['重点知识点讲解与经典题目练习', '特情热点问题分享与重点练习'],
              },
              {
                id: 'opi',
                title: 'OPI',
                items: ['基础语言体系与思路粗略构建', '重难点话题集中练习 语音语调纠正 结构与逻辑提高', '热点话题分享与备考模拟测试'],
              },
            ],
          },
        ],
      },
      {
        id: 'icao5',
        label: 'ICAO 5 进阶',
        plans: [
          {
            id: 'icao5-foundation',
            name: 'ICAO 5 基础班',
            price: '5400',
            unit: '元 / 18 节课',
            period: '周期约 50 天',
            description: '适合已通过 ICAO 4、自身英语基础较好，但对 ICAO 5 的学习仍存在一定困难的同学。',
            outline: [
              {
                id: 'assessment',
                title: '测评与备考规划',
                items: ['基础水平测试与学习备考规划', 'ICAO5考试结构与评分标准讲解分析', '听力深度测试 基础语感与输入能力构建', '基础航空英语词汇测试与积累'],
              },
              {
                id: 'sentence-900',
                title: '900句',
                items: ['学习技巧与速记体系养成', '长难句子解析，情景意识构建', '精准模拟测评 考试技巧分享'],
              },
              {
                id: 'radiotelephony',
                title: '陆空通话',
                items: ['正常流程讲解 基本题目结构介绍', '重点答题技巧与知识点讲解 经典题目练习与解析'],
              },
              {
                id: 'retell',
                title: '故事复述',
                items: ['输入能力的培养与速记能力构建', '表达能力提升', '热点内部题库分享', '经典题目练习与解析', '答题技巧与做题节奏'],
              },
              {
                id: 'opi',
                title: 'OPI',
                items: ['基础语言体系与答题思路详细讲解与构建', '重难点话题集中讲解与练习 语音语调纠正 结构与逻辑提高', '热点话题分享与备考', '听不懂问题专项练习', '深度模拟测试', '考试技巧分享与考前注意事项'],
              },
            ],
          },
          {
            id: 'icao5-intensive',
            name: 'ICAO 5 冲刺班',
            price: '4500',
            unit: '元 / 12 节课',
            period: '周期约 30 天',
            description: '适合自身英语能力过硬，已经处在icao5复习的阶段之中，或有过icao5考试经验的同学。',
            outline: [
              {
                id: 'assessment',
                title: '测评与备考规划',
                items: ['基础水平测试与学习备考规划', 'ICAO5考试结构与评分标准讲解分析', '听力深度测试 基础语感与输入能力构建'],
              },
              {
                id: 'sentence-900',
                title: '900句',
                items: ['长难句子解析，情景意识构建', '精准模拟测评 考试技巧分享'],
              },
              {
                id: 'radiotelephony',
                title: '陆空通话',
                items: ['重点答题技巧与知识点讲解 经典题目练习与解析'],
              },
              {
                id: 'retell',
                title: '故事复述',
                items: ['表达能力提升', '热点内部题库分享', '经典题目练习与解析', '答题技巧与做题节奏'],
              },
              {
                id: 'opi',
                title: 'OPI',
                items: ['重难点话题集中讲解与练习 语音语调纠正 结构与逻辑提高', '热点话题分享与备考', '听不懂问题专项练习', '深度模拟测试', '考试技巧分享与考前注意事项'],
              },
            ],
          },
        ],
      },
      {
        id: 'assessment',
        label: '专项深测',
        plans: [
          {
            id: 'opi-assessment',
            name: 'OPI 专项深测',
            price: '400',
            unit: '元 / 2 课时',
            description: '针对 OPI 板块进行模拟考试对练，纠正问题、建议方向、预测通过率并分享热点话题。',
            outline: [
              {
                id: 'opi-assessment',
                title: 'OPI专项深测',
                items: ['深度还原考试节奏，考前全真模拟测试', '检测OPI弱点并针对性解决', '真实反馈通过率', '分享近期热点话题', '规划备考方向'],
              },
            ],
          },
          {
            id: 'full-assessment',
            name: '全板块深测',
            price: '400',
            unit: '元 / 2 课时',
            description: '针对 ICAO 考试所有板块进行模拟考试练习，纠正问题、建议方向及预测通过率。',
            outline: [
              {
                id: 'full-assessment',
                title: '全板块模拟',
                items: ['模拟真实考试节奏与难度', '检查各部分弱点并针对性解决', '考前经验分享', '规划备考方向'],
              },
            ],
          },
        ],
      },
    ],
  },
  contact: {
    quote: '「愿每位飞行同僚都能在自己的飞行道路上披荆斩棘，我们自会顶峰相见。」',
    label: '咨询请添加微信',
    wechatIds: ['15736231388', '17367473982'],
    footer: '© 2026 飞猪 ICAO 英语培训团队 · 在职飞行员一对一线上教学',
  },
} as const satisfies CoursePromoCatalog;
