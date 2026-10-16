import { useSaveAction } from './use-save-action.native';
import { BookOpen, TriangleAlert } from '@/components/ui/icons';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { TopBar } from '@/components/navigation/TopBar';
import { CenteredState } from '@/components/states/CenteredState';
import { Screen } from '@/components/ui';

import {
  VocabularyBookDetailView,
  VocabularyBooksView,
  VocabularyWordListView,
} from './components/VocabularyLibraryViews';
import {
  VocabularyCompletionView,
  VocabularyStudyView,
  type VocabularySessionSummary,
} from './components/VocabularyStudyViews';
import {
  VocabularyTestIntroView,
  VocabularyTestResultView,
  VocabularyTestRunner,
} from './components/VocabularyTestViews';
import { useVocabularyProgress } from './progress-store.native';
import { loadVocabulary, type VocabularyLoadResult } from './repository.native';
import type {
  VocabularyBookId,
  VocabularyTestResult,
  VocabularyWord,
  VocabularyWordStatus,
} from './types';

type LibraryView = 'books' | 'detail' | 'list';
type ReturnView = LibraryView | 'complete' | 'sessionList';
type ViewName = ReturnView | 'study' | 'testIntro' | 'testRun' | 'testResult';
type SessionStatus = Exclude<VocabularyWordStatus, 'new'>;

const emptySummary: VocabularySessionSummary = { known: 0, vague: 0, forgot: 0, wrong: 0 };

export function VocabularyScreen() {
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadResult, setLoadResult] = useState<VocabularyLoadResult>();
  const [loadError, setLoadError] = useState(false);
  const books = useMemo(() => loadResult?.dataset.books ?? [], [loadResult]);
  const progress = useVocabularyProgress(books);
  const save = useSaveAction();
  const [view, setView] = useState<ViewName>('books');
  const [returnView, setReturnView] = useState<ReturnView>('books');
  const [activeBookId, setActiveBookId] = useState<VocabularyBookId>('preview');
  const [selected, setSelected] = useState<Set<VocabularyBookId>>(new Set());
  const [studyWords, setStudyWords] = useState<VocabularyWord[]>([]);
  const [studyIndex, setStudyIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sessionStatuses, setSessionStatuses] = useState<Record<string, SessionStatus>>({});
  const [sessionSummary, setSessionSummary] = useState<VocabularySessionSummary>(emptySummary);
  const [testRunKey, setTestRunKey] = useState(0);
  const [currentTestResult, setCurrentTestResult] = useState<VocabularyTestResult>();

  useEffect(() => {
    let active = true;
    setLoadError(false);
    void loadVocabulary().then((result) => { if (active) setLoadResult(result); }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [loadAttempt]);

  const activeBook = useMemo(() => books.find((book) => book.id === activeBookId) ?? books[0], [activeBookId, books]);
  const startStudy = useCallback((words: VocabularyWord[], from: ReturnView) => {
    const unlearned = words.filter((word) => (progress.state.words[word.id]?.status ?? 'new') === 'new');
    const learned = words.filter((word) => (progress.state.words[word.id]?.status ?? 'new') !== 'new');
    setStudyWords([...unlearned, ...learned]);
    setStudyIndex(0);
    setRevealed(false);
    setSessionStatuses({});
    setSessionSummary(emptySummary);
    setReturnView(from);
    setView('study');
  }, [progress.state.words]);

  if (progress.error) return <Screen><TopBar title="单词学习" /><CenteredState icon={TriangleAlert} title="学习进度读取失败" description="本机进度暂时无法读取，尚未开始新的学习记录。请检查设备可用空间后重试。" actionLabel="重试读取" onAction={progress.retry} /></Screen>;

  function content() {
  if (!loadResult || !progress.ready) {
    return (
      <Screen contentStyle={{ paddingHorizontal: 0 }}>
        <TopBar title="单词学习" />
        {loadError ? (
          <CenteredState icon={TriangleAlert} title="词汇资源暂时不可用" description="首次使用需要联网获取词汇资源。请检查网络后重试。" actionLabel="重新加载" onAction={() => setLoadAttempt((value) => value + 1)} tone="destructive" />
        ) : (
          <CenteredState icon={BookOpen} title="正在准备词汇资源" description="正在读取 838 条 ICAO 词汇和你的学习进度。" />
        )}
      </Screen>
    );
  }

  if (view === 'detail' && activeBook) {
    return <VocabularyBookDetailView book={activeBook} onBack={() => setView('books')} onList={() => setView('list')} onReset={() => save.run(() => progress.resetBook(activeBook))} onStudy={() => startStudy(activeBook.words, 'detail')} stats={progress.statsByBook[activeBook.id]!} />;
  }

  if (view === 'list' && activeBook) {
    return <VocabularyWordListView book={activeBook} onBack={() => setView('detail')} onStart={(words) => startStudy(words, 'list')} onToggleFavorite={(word) => save.run(() => progress.toggleFavorite(word))} state={progress.state} />;
  }

  if (view === 'study' && studyWords.length) {
    const currentWord = studyWords[studyIndex]!;
    const recordStatus = (status: SessionStatus) => {
      return save.run(() => progress.setStatus(currentWord.id, status), () => {
        setSessionStatuses((current) => ({ ...current, [currentWord.id]: status }));
        setRevealed(true);
      });
    };
    const next = () => {
      if (studyIndex < studyWords.length - 1) {
        setStudyIndex((value) => value + 1);
        setRevealed(false);
        return;
      }
      const summary = Object.values(sessionStatuses).reduce((result, status) => ({ ...result, [status]: result[status] + 1 }), { ...emptySummary });
      setSessionSummary(summary);
      setView('complete');
    };
    return <VocabularyStudyView index={studyIndex} onChoose={recordStatus} onExit={() => setView(returnView)} onNext={next} onToggleFavorite={() => save.run(() => progress.toggleFavorite(currentWord))} onWrong={() => recordStatus('wrong')} revealed={revealed} state={progress.state} words={studyWords} />;
  }

  if (view === 'complete') {
    const weakWords = studyWords.filter((word) => ['vague', 'forgot', 'wrong'].includes(sessionStatuses[word.id] ?? ''));
    return <VocabularyCompletionView onBack={() => setView(returnView)} onRestart={() => startStudy(studyWords, returnView)} onReview={() => startStudy(weakWords, returnView)} onViewWords={() => setView('sessionList')} summary={sessionSummary} total={studyWords.length} />;
  }

  if (view === 'sessionList' && studyWords.length) {
    const sourceBook = books.find((book) => book.id === studyWords[0]!.bookId)!;
    const sessionBook = { ...sourceBook, name: '本轮单词', description: '本轮学习队列中的全部词汇。', words: studyWords };
    return <VocabularyWordListView book={sessionBook} onBack={() => setView('complete')} onStart={(words) => startStudy(words, 'sessionList')} onToggleFavorite={(word) => save.run(() => progress.toggleFavorite(word))} state={progress.state} />;
  }

  if (view === 'testIntro') {
    return <VocabularyTestIntroView lastTest={progress.state.lastTest} onBack={() => setView('books')} onStart={() => { setTestRunKey((value) => value + 1); setView('testRun'); }} />;
  }

  if (view === 'testRun') {
    return <VocabularyTestRunner books={books} key={testRunKey} onExit={() => setView('testIntro')} onFinish={(result) => { void save.run(() => progress.saveTestResult(result), () => { setCurrentTestResult(result); setView('testResult'); }); }} />;
  }

  if (view === 'testResult' && currentTestResult) {
    return <VocabularyTestResultView onBack={() => setView('books')} onRestart={() => { setTestRunKey((value) => value + 1); setView('testRun'); }} result={currentTestResult} />;
  }

  return (
    <VocabularyBooksView
      books={books}
      lastTest={progress.state.lastTest}
      onDetail={(id) => { setActiveBookId(id); setView('detail'); }}
      onStart={() => startStudy(books.filter((book) => selected.has(book.id)).flatMap((book) => book.words), 'books')}
      onTest={() => setView('testIntro')}
      onToggle={(id) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
      selected={selected}
      state={progress.state}
      statsByBook={progress.statsByBook}
      warning={loadResult.warning}
    />
  );
  }
  return save.wrap(content());
}
