import { prepareVocabularySession, reconcileVocabularySession } from './study-session';
import { currentVocabularyPolicy } from './live-catalog';
import { useStudyOrder } from './use-study-order';
import { useLocalBack } from '@/components/navigation/useLocalBack';
import { useGuide, useGuideConfirmation, useGuideAvailability } from '@/features/usage-guide/GuideBindings';
import { useSaveAction } from './use-save-action.native';
import { BookOpen, TriangleAlert } from '@/components/ui/icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
import { useVocabularyCatalog } from './use-vocabulary-catalog';
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
  const guide = useGuide();
  const [view, setView] = useState<ViewName>('books');
  const { loadResult, loadError, retry } = useVocabularyCatalog(view === 'books');
  const policy=currentVocabularyPolicy();
  const books = useMemo(() => (loadResult?.dataset.books ?? []).map(book=>({...book,words:book.words.filter(word=>!Object.hasOwn(policy?.retiredIds??{},word.id))})), [loadResult,policy]);
  const progress = useVocabularyProgress(books);
  const { order, chooseOrder } = useStudyOrder();
  const save = useSaveAction();
  const sessionOrigin = useRef<ReturnView>('books');
  const [returnView, setReturnView] = useState<ReturnView>('books');
  const [activeBookId, setActiveBookId] = useState<VocabularyBookId>('preview');
  const [selected, setSelected] = useState<Set<VocabularyBookId>>(new Set());
  useGuideConfirmation('vocab-book', selected.size > 0);
  const [studyWords, setStudyWords] = useState<VocabularyWord[]>([]);
  const [studyIndex, setStudyIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const advancingIndex = useRef(studyIndex);
  advancingIndex.current = studyIndex;
  const [sessionStatuses, setSessionStatuses] = useState<Record<string, SessionStatus>>({});
  const [sessionSummary, setSessionSummary] = useState<VocabularySessionSummary>(emptySummary);
  const [testRunKey, setTestRunKey] = useState(0);
  const [currentTestResult, setCurrentTestResult] = useState<VocabularyTestResult>();
  const liveWords = useRef(studyWords), liveIndex = useRef(studyIndex), liveAnswers = useRef(sessionStatuses);
  liveWords.current=studyWords; liveIndex.current=studyIndex; liveAnswers.current=sessionStatuses;
  const sessionStartedAt=useRef<string | undefined>(undefined);
  useEffect(()=>{
    if(view!=='study'||!policy)return;
    const persisted=progress.state.studySession?.startedAt===sessionStartedAt.current?progress.state.studySession?.answers:{};
    const next=reconcileVocabularySession(studyWords,studyIndex,{...sessionStatuses,...persisted},policy);
    const changed=next.words.length!==studyWords.length;
    if(changed)setStudyWords(next.words);
    if(next.index!==studyIndex)setStudyIndex(next.index);
    if(JSON.stringify(next.statuses)!==JSON.stringify(sessionStatuses))setSessionStatuses(next.statuses);
    const nextId=next.words[next.index]?.id;
    if(nextId!==studyWords[studyIndex]?.id || nextId&&next.statuses[nextId]&&!sessionStatuses[nextId])setRevealed(Boolean(nextId&&next.statuses[nextId]));
    if(changed&&next.complete){
      if(!next.words.length)setView('books');
      else {setSessionSummary(Object.values(next.statuses).reduce((result,status)=>({...result,[status]:result[status]+1}),{...emptySummary}));setView('complete');}
    }
  },[policy,progress.state.studySession,sessionStatuses,studyIndex,studyWords,view]);

  useGuideAvailability('vocab', progress.error ? '学习进度读取失败，请重试读取。' : loadError ? '词汇资源暂时不可用，请重新加载。' : undefined);
  const activeBook = useMemo(() => books.find((book) => book.id === activeBookId) ?? books[0], [activeBookId, books]);
  const startStudy = useCallback((words: VocabularyWord[], from: ReturnView, resumeWord?: string) => {
    const prepared = prepareVocabularySession(words, progress.state, order, resumeWord);
    const ordered = prepared.queue;
    if (!ordered.length) return;
    void save.run(() => progress.saveStudySession(prepared.session), () => {
      sessionStartedAt.current=prepared.session.startedAt;
      setStudyWords(ordered);
      setStudyIndex(prepared.index);
      setRevealed(prepared.revealed || Boolean(guide?.current === 'vocab' && guide.step && ['vocab-meaning', 'vocab-favorite', 'vocab-next'].includes(guide.step)));
      setSessionStatuses(prepared.statuses);
      setSessionSummary(emptySummary);
      if (from !== 'sessionList') sessionOrigin.current = from;
      setReturnView(from);
      setView('study');
    });
  }, [progress, save, order, guide]);

  const restoredGuide = useRef(false);
  useEffect(() => {
    if (guide?.current !== 'vocab') { restoredGuide.current = false; return; }
    if (!progress.ready || !books.length || restoredGuide.current) return;
    restoredGuide.current = true;
    const ids = guide.checkpointData?.vocabBooks ?? [];
    if (ids.length) setSelected(new Set(ids.filter(id => books.some(book => book.id === id)) as VocabularyBookId[]));
    if (guide.step && !['vocab-book', 'vocab-start'].includes(guide.step)) {
      const chosen = books.filter(book => ids.includes(book.id));
      if (!chosen.length) { setSelected(new Set()); setView('books'); guide.rewind?.('vocab-book'); return; }
      const words = chosen.flatMap(book => book.words);
      startStudy(words, 'books', guide.checkpointData?.vocabWord);
      if (['vocab-meaning', 'vocab-favorite', 'vocab-next'].includes(guide.step)) setRevealed(true);
    }
  }, [books, guide, progress.ready, startStudy]);
  useEffect(() => {
    if (guide?.current !== 'vocab' || !restoredGuide.current || !selected.size) return;
    guide.checkpoint({ vocabBooks: [...selected], ...(studyWords[studyIndex] ? { vocabWord: studyWords[studyIndex]!.id } : {}) });
  }, [guide, selected, studyIndex, studyWords]);

  const backView = () => {
    if (save.isPending() || save.failed) return;
    if (guide?.current === 'vocab') guide.pause();
    if (view === 'list') setView('detail');
    else if (view === 'study') setView(returnView);
    else if (view === 'complete') setView(sessionOrigin.current);
    else if (view === 'sessionList') setView('complete');
    else if (view === 'testRun') setView('testIntro');
    else setView('books');
  };
  const back = useLocalBack(view !== 'books' && !progress.error, backView);

  if (progress.error) return <Screen header={<TopBar title="单词学习" />}><CenteredState icon={TriangleAlert} title="学习进度读取失败" description="本机进度暂时无法读取，尚未开始新的学习记录。请检查设备可用空间后重试。" actionLabel="重试读取" onAction={progress.retry} /></Screen>;

  function content() {
  if (!loadResult || !progress.ready) {
    return (
      <Screen contentStyle={{ paddingHorizontal: 0 }} header={<TopBar title="单词学习" />}>
        {loadError ? (
          <CenteredState icon={TriangleAlert} title="词汇资源暂时不可用" description="首次使用需要联网获取词汇资源。请检查网络后重试。" actionLabel="重新加载" onAction={retry} tone="destructive" />
        ) : (
          <CenteredState icon={BookOpen} title="正在准备词汇资源" description="正在读取 ICAO 词书和你的学习进度。" />
        )}
      </Screen>
    );
  }

  if (view === 'detail' && activeBook) {
    return <VocabularyBookDetailView order={order} onOrderChange={chooseOrder} book={activeBook} onBack={back} onList={() => setView('list')} onReset={() => save.run(() => progress.resetBook(activeBook))} onStudy={() => startStudy(activeBook.words, 'detail')} stats={progress.statsByBook[activeBook.id]!} />;
  }

  if (view === 'list' && activeBook) {
    return <VocabularyWordListView book={activeBook} onBack={back} onStart={(words) => startStudy(words, 'list')} onToggleFavorite={(word) => save.run(() => progress.toggleFavorite(word))} state={progress.state} />;
  }

  if (view === 'study' && studyWords.length) {
    const currentWord = studyWords[studyIndex]!;
    const recordStatus = (status: SessionStatus) => {
      return save.run(() => progress.setStatus(currentWord.id, status), () => {
        if(liveWords.current[liveIndex.current]?.id!==currentWord.id || Object.hasOwn(currentVocabularyPolicy()?.retiredIds??{},currentWord.id))return;
        setSessionStatuses((current) => ({ ...current, [currentWord.id]: status }));
        setRevealed(true);
        guide?.event('vocab-rating');
      });
    };
    const next = () => {
      if (save.isPending() || save.failed || advancingIndex.current !== studyIndex) return;
      advancingIndex.current = studyIndex + 1;
      const snapshot=reconcileVocabularySession(liveWords.current,liveIndex.current,liveAnswers.current,currentVocabularyPolicy());
      const currentPosition=snapshot.words.findIndex(word=>word.id===currentWord.id);
      const nextPosition=currentPosition<0?snapshot.complete?-1:snapshot.index:snapshot.words.findIndex((word,index)=>index>currentPosition&&!snapshot.statuses[word.id]);
      void save.run(() => progress.saveStudySession({wordIds:snapshot.words.map(word=>word.id),answers:snapshot.statuses,order,startedAt:sessionStartedAt.current ?? new Date().toISOString(),updatedAt:new Date().toISOString(),nextWordId:snapshot.words[nextPosition]?.id ?? null}), () => {
        const fresh=reconcileVocabularySession(liveWords.current,liveIndex.current,liveAnswers.current,currentVocabularyPolicy());
        if(liveWords.current[liveIndex.current]?.id!==currentWord.id)return;
        const position=fresh.words.findIndex(word=>word.id===currentWord.id);
        const following=position<0?fresh.complete?-1:fresh.index:fresh.words.findIndex((word,index)=>index>position&&!fresh.statuses[word.id]);
        setStudyWords(fresh.words);setSessionStatuses(fresh.statuses);
        if(following>=0){setStudyIndex(following);setRevealed(false);return;}
        const summary=Object.values(fresh.statuses).reduce((result,status)=>({...result,[status]:result[status]+1}),{...emptySummary});
        setSessionSummary(summary);setView(fresh.words.length?'complete':'books');
      });
    };
    return <VocabularyStudyView savedStatus={sessionStatuses[currentWord.id]} busy={save.saving || save.failed} index={studyIndex} onChoose={recordStatus} onExit={back} onNext={next} onToggleFavorite={() => save.run(() => progress.toggleFavorite(currentWord), () => guide?.event('vocab-favorite'))} onWrong={() => recordStatus('wrong')} revealed={revealed} state={progress.state} words={studyWords} />;
  }

  if (view === 'complete') {
    const weakWords = studyWords.filter((word) => ['vague', 'forgot', 'wrong'].includes(sessionStatuses[word.id] ?? ''));
    return <VocabularyCompletionView returnLabel={sessionOrigin.current === 'list' ? '返回单词列表' : sessionOrigin.current === 'detail' ? '返回词书详情' : '返回词书'} onBack={back} onRestart={() => startStudy(studyWords, returnView)} onReview={() => startStudy(weakWords, returnView)} onViewWords={() => setView('sessionList')} summary={sessionSummary} total={Math.max(studyWords.length,Object.keys(sessionStatuses).length)} />;
  }

  if (view === 'sessionList' && studyWords.length) {
    const sourceBook = books.find((book) => book.id === studyWords[0]!.bookId)!;
    const sessionBook = { ...sourceBook, name: '本轮单词', description: '本轮学习队列中的全部词汇。', words: studyWords };
    return <VocabularyWordListView book={sessionBook} onBack={back} onStart={(words) => startStudy(words, 'sessionList')} onToggleFavorite={(word) => save.run(() => progress.toggleFavorite(word))} state={progress.state} />;
  }

  if (view === 'testIntro') {
    return <VocabularyTestIntroView lastTest={progress.state.lastTest} onBack={back} onStart={() => { setTestRunKey((value) => value + 1); setView('testRun'); }} />;
  }

  if (view === 'testRun') {
    return <VocabularyTestRunner books={books} key={testRunKey} onExit={back} onFinish={(result) => { void save.run(() => progress.saveTestResult(result), () => { setCurrentTestResult(result); setView('testResult'); }); }} />;
  }

  if (view === 'testResult' && currentTestResult) {
    return <VocabularyTestResultView onBack={back} onRestart={() => { setTestRunKey((value) => value + 1); setView('testRun'); }} result={currentTestResult} />;
  }

  return (
    <VocabularyBooksView
      order={order}
      onOrderChange={chooseOrder}
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
