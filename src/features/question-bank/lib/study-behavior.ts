import type { QuestionBankDataset, StudyBehavior } from '../types';

const reviewByBank: Record<QuestionBankDataset['id'], StudyBehavior['reviewKind']> = {
  listening: 'none',
  sentences900: 'exact-match',
  radiotelephony: 'grammar-placeholder',
  opi: 'opi-placeholder',
  storytelling: 'grammar-placeholder',
};

export function getStudyBehavior(dataset: QuestionBankDataset): StudyBehavior {
  return {
    taskKind: dataset.study.interaction === 'choices' ? 'choices' : 'recording',
    recordingMode: dataset.study.interaction === 'retell' ? 'retell' : dataset.study.tools.recorder ? 'speaking' : undefined,
    workbenchTabs: dataset.study.consoleTabs.filter((tab) => {
      if (tab === 'mine') return dataset.study.tools.recorder;
      if (tab === 'notes') return dataset.study.tools.notes;
      return true;
    }),
    reviewKind: reviewByBank[dataset.id],
    generatedAudio: dataset.id === 'opi',
    transcriptLabel: dataset.study.copy.transcriptLabel,
    referenceLabel: dataset.study.copy.referenceLabel,
  };
}
