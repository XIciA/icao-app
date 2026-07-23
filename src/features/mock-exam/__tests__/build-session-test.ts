import { buildMockExamSession } from '../build-session';

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
});
