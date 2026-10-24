/** Existing range descriptions; only punctuation, spacing and paragraph breaks are normalized. */
export const STUDY_SCOPE_OPTIONS = [
  { value: 'selected', title: '精选题库', paragraphs: [
    '包含主要常见题型和所有基础知识点，本题库中所包含的知识点足以应对绝大部分 ICAO 考试。',
    '适用于英语基础平常，备考时间紧张的同学。',
  ] },
  { value: 'all', title: '最全题库', paragraphs: [
    '所有问题的大合集，涵盖所有的知识点与题型，包括变形题、热点题、易错题、精选题、难点题和考试真题，知识点有重合的地方。',
    '适用于刷题时间足够、有一定语言基础的同学。',
  ] },
] as const;
