/** User-approved scope descriptions, shared by every study preference entry. */
export const STUDY_SCOPE_OPTIONS = [
  { value: 'selected', title: '精选题库', paragraphs: [
    '聚焦主要常见题型，涵盖全部基础知识点，所含知识点足以应对绝大部分 ICAO 考试。',
    '适合备考时间有限，希望打好基础、优先掌握必考题型的同学。',
  ] },
  { value: 'all', title: '最全题库', paragraphs: [
    '汇集精选内容与更多拓展题目，全面涵盖各类知识点与题型，包括变形题、热点题、易错题、难点题和考试真题。部分题目围绕相同知识点展开，可用于巩固练习、加深理解。',
    '适合备考时间充足，希望扩大练习范围、加强综合训练的同学。',
  ] },
] as const;
