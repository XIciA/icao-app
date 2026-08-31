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
  });

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
