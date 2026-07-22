import type { QuestionBankDataset, StudyBehavior } from '../types';

const reviewByBank: Record<QuestionBankDataset['id'], StudyBehavior['reviewKind']> = {
  listening: 'none',
  sentences900: 'exact-match',
  radiotelephony: 'grammar',
  opi: 'opi-analysis',
  storytelling: 'grammar',
};

export function getStudyBehavior(dataset: QuestionBankDataset): StudyBehavior {
  const configuredReview = dataset.capabilities?.reviewMode;
  const reviewKind = configuredReview === 'grammar'
    ? 'grammar'
    : configuredReview === 'expression-analysis'
      ? 'opi-analysis'
      : configuredReview ?? reviewByBank[dataset.id];
  return {
    taskKind: dataset.study.interaction === 'choices' ? 'choices' : 'recording',
    recordingMode: dataset.study.interaction === 'retell' ? 'retell' : dataset.study.tools.recorder ? 'speaking' : undefined,
    workbenchTabs: dataset.study.consoleTabs.filter((tab) => {
      if (tab === 'mine') return dataset.study.tools.recorder;
      if (tab === 'notes') return dataset.study.tools.notes;
      return dataset.id !== 'listening';
    }),
    reviewKind,
    generatedAudio: dataset.capabilities?.audioMode === 'generated' || (!dataset.capabilities && dataset.id === 'opi'),
    transcriptLabel: dataset.study.copy.transcriptLabel,
    referenceLabel: dataset.study.copy.referenceLabel,
  };
}
