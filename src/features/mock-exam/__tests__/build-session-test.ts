import { questionBankRepository } from '@/features/question-bank/data/repository.native';
import { buildMockExamSession as buildNative } from '../build-session.native';
import { buildMockExamSession, toQuestionBankStudyPackage } from '../build-session';

describe('buildMockExamSession', () => {
  it('builds the ICAO 4 complete paper with rule-based section counts and unique item ids', async () => {
    const session = await buildMockExamSession({ examType: 'icao4-first', modules: ['listening', 'sentences900', 'radiotelephony', 'opi'] }, 73);
    expect(session.mode).toBe('complete');
    expect(session.sections.filter((section) => section.moduleId === 'listening').map((section) => section.items).flat()).toHaveLength(20);
    expect(session.sections.filter((section) => section.moduleId === 'sentences900').map((section) => section.items).flat()).toHaveLength(12);
    expect(session.sections.find((section) => section.moduleId === 'radiotelephony')?.items.length).toBeGreaterThanOrEqual(15);
    expect(session.sections.find((section) => section.moduleId === 'radiotelephony')?.items.length).toBeLessThanOrEqual(20);
    expect(session.sections.filter((section) => section.moduleId === 'opi').map((section) => section.items).flat()).toHaveLength(5);
    expect(new Set(session.items.map((item) => item.id)).size).toBe(session.items.length);
  // The first case cold-loads all four real catalogs on a clean CI runner.
  }, 15_000);

  it('marks a partial allowed selection as custom and adds expert sentence groups for ICAO 5', async () => {
    const session = await buildMockExamSession({ examType: 'icao5-first', modules: ['sentences900', 'storytelling'] }, 74);
    expect(session.mode).toBe('custom');
    expect(session.sections.filter((section) => section.moduleId === 'sentences900')).toHaveLength(5);
    expect(session.sections.filter((section) => section.moduleId === 'sentences900').map((section) => section.items).flat()).toHaveLength(20);
    expect(session.sections.find((section) => section.moduleId === 'storytelling')?.items).toHaveLength(1);
  });

  it('converts a complete mock exam into a session-only shared study package', async () => {
    const session = await buildMockExamSession({ examType: 'icao4-recert', modules: ['radiotelephony', 'opi'] }, 75);
    const studyPackage = toQuestionBankStudyPackage(session);

    expect(studyPackage).toMatchObject({
      id: session.id,
      startedAt: session.startedAt,
      progressMode: 'session-only',
      record: {
        id: `mock-exam-record-${session.id}`,
        bankId: 'mock_exam',
        bankTitle: '模拟练习',
        categoryTitle: 'ICAO 4 复考',
        topicTitle: '按考试规则组卷',
        recordType: 'mock_exam',
        mockExam: {
          examType: 'icao4-recert',
          mode: 'complete',
          moduleIds: ['radiotelephony', 'opi'],
        },
      },
    });
    expect(studyPackage.record.mockExam?.sectionCounts).toEqual(
      session.sections.map((section) => ({ id: section.id, title: section.title, total: section.items.length })),
    );
  });

  it('preserves each drawn question source identity and custom-mode labels', async () => {
    const session = await buildMockExamSession({ examType: 'icao5-first', modules: ['listening', 'opi'] }, 76);
    const studyPackage = toQuestionBankStudyPackage(session);

    expect(studyPackage.record.topicTitle).toBe('自选练习 · 听力、OPI 口语面试');
    expect(studyPackage.record.mockExam).toMatchObject({
      examType: 'icao5-first',
      mode: 'custom',
      moduleIds: ['listening', 'opi'],
    });
    expect(studyPackage.items).toHaveLength(session.items.length);
    studyPackage.items.forEach((item, index) => {
      const source = session.items[index];
      expect(item).toMatchObject({
        id: source.id,
        sectionId: source.sectionId,
        sectionTitle: session.sections.find((section) => section.id === source.sectionId)?.title,
      });
      expect(item.dataset).toBe(source.dataset);
      expect(item.category).toBe(source.category);
      expect(item.topic).toBe(source.topic);
      expect(item.card).toBe(source.card);
      expect({
        bankId: item.dataset.id,
        categoryId: item.category.id,
        topicId: item.topic.id,
        cardId: item.card.id,
      }).toEqual(source.source);
    });
  });
});

it('builds ICAO 5 recertification with only radiotelephony, one story and five OPI questions', async () => {
  const session = await buildNative({ examType: 'icao5-recert', modules: ['listening', 'radiotelephony', 'opi', 'storytelling'] }, 124);
  expect(session.config.modules).toEqual(['radiotelephony', 'storytelling', 'opi']);
  expect(session.mode).toBe('complete');
  expect(session.items.filter(item => item.moduleId === 'storytelling')).toHaveLength(1);
  expect(session.items.filter(item => item.moduleId === 'opi')).toHaveLength(5);
  expect(session.items.some(item => ['listening', 'sentences900'].includes(item.moduleId))).toBe(false);
});
it('keeps seeded selections fixed with no repeated source questions and rejects an empty module selection', async () => {
  const config = { examType: 'icao5-first' as const, modules: ['listening', 'sentences900', 'radiotelephony', 'storytelling', 'opi'] as const };
  const [first, second] = await Promise.all([buildNative({ ...config, modules: [...config.modules] }, 25), buildNative({ ...config, modules: [...config.modules] }, 25)]);
  const identities = first.items.map(item => JSON.stringify(item.source));
  expect(identities).toEqual(second.items.map(item => JSON.stringify(item.source)));
  expect(new Set(identities).size).toBe(identities.length);
  expect(first.sections.filter(section => section.moduleId === 'listening').map(section => section.items.length)).toEqual([5, 5, 5, 5]);
  expect(first.sections.filter(section => section.moduleId === 'sentences900').map(section => section.items.length)).toEqual([4, 4, 4, 4, 4]);
  await expect(buildNative({ examType: 'icao4-first', modules: [] })).rejects.toThrow('至少选择');
});


it('draws identical listening sources by stable category IDs after display labels change', async () => {
 const config={examType:'icao4-first' as const,modules:['listening' as const]};
 const before=await buildNative(config,109);
 const read=questionBankRepository.getDataset.bind(questionBankRepository);
 const renamed=jest.spyOn(questionBankRepository,'getDataset').mockImplementation(async id=>{
  const dataset=await read(id);
  return dataset && id==='listening'?{...dataset,categories:dataset.categories.map(c=>({...c,name:`新显示名称 ${c.id}`}))}:dataset;
 });
 try {
  const after=await buildNative(config,109);
  expect(after.items.map(item=>item.source)).toEqual(before.items.map(item=>item.source));
  expect(after.sections.map(section=>section.items[0].source.categoryId)).toEqual(['listening-category-01','listening-category-04','listening-category-03','listening-category-02']);
 } finally {renamed.mockRestore();}
});
