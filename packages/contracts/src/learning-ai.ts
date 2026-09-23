/** Version 2 is opt-in; clients without this capability retain the v1 review. */
export type LearningReviewSource = {
  bankId: 'radiotelephony' | 'storytelling' | 'opi';
  categoryId: string;
  topicId: string;
  version: number;
  checksum: string;
};

export type LearningReviewMaterials = {
  questionText: string;
  contextText: string;
  referenceText: string;
  /** Text-only review cannot verify an unseen picture. */
  hasUnseenImage: boolean;
};

type GrammarError = { before: string; after: string; reasonZh: string };
export type LearningAnalysis =
  | { module: 'atc' | 'story'; grammarErrors: GrammarError[];
      missingInformation: { sourceQuote: string; reasonZh: string }[];
      incorrectInformation: { sourceQuote: string; answerQuote: string; reasonZh: string }[];
      extraInformation: { answerQuote: string; reasonZh: string }[] }
  | { module: 'opi'; offTopic: null | { questionQuote: string; answerQuote: string; reasonZh: string };
      grammarErrors: GrammarError[]; polishedText: string };
