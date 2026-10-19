import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { TopBar } from '@/components/navigation/TopBar';
import { CenteredState } from '@/components/states/CenteredState';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { Screen } from '@/components/ui';
import { QuestionBankStudyScreen } from '@/features/question-bank/components/QuestionBankStudyScreen.native';
import { StudyReport } from '@/features/question-bank/components/StudyReport.native';
import { getLearningRecords, loadLearningRecordReview } from '@/features/question-bank/platform/learning-record-storage.native';
import type { LearningRecord, QuestionBankStudyPackage } from '@/features/question-bank/types';
import { loadSentenceTutorial } from './tutorial-package';
import { TutorialContext } from './TutorialContext';
import { advanceTutorial, emptyTutorialProgress, TUTORIAL_STEPS, type TutorialProgress, type TutorialStepId } from './tutorial-model';
import { readTutorialProgress, writeTutorialProgress } from './tutorial-progress';


export function SentenceTutorialScreen() {
  const router = useRouter();
  const { restart } = useLocalSearchParams<{ restart?: string }>();
  const auth = useAuth();
  const accountId = auth.account?.accountId ?? (auth.uiAcceptanceMode ? 'ui-acceptance' : undefined);
  const [state, setState] = useState<{ accountId: string; progress: TutorialProgress; studyPackage?: QuestionBankStudyPackage; record?: LearningRecord }>();
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const scrollOffset = useRef(0);
  const current = useRef<TutorialProgress>(emptyTutorialProgress());
  const owner = useRef(accountId);
  owner.current = accountId;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    setState(undefined); setError(''); setSaveError('');
    if (!accountId) { setError('请先确认登录状态，再开始教程。'); return; }
    void (async () => {
      let progress = Boolean(restart) ? emptyTutorialProgress() : await readTutorialProgress(accountId);
      let record: LearningRecord | undefined;
      if (progress.recordId && progress.step >= TUTORIAL_STEPS.findIndex(step => step.id === 'recap')) {
        const saved = (await getLearningRecords()).find(record => record.id === progress.recordId);
        if (saved) record = await loadLearningRecordReview(saved);
        else progress = { ...progress, step: TUTORIAL_STEPS.findIndex(step => step.id === 'finish'), recordId: undefined };
      }
      const studyPackage = record ? undefined : await loadSentenceTutorial();
      if (!active) return;
      current.current = progress;
      setState({ accountId, progress, studyPackage, record });
      if (Boolean(restart)) await writeTutorialProgress(accountId, progress);
    })().catch(() => { if (active) setError('教程或进度暂时无法读取。请联网后重试，已有学习数据仍保留。'); });
    return () => { active = false; };
  }, [accountId, restart, attempt]);
  const update = useCallback((next: TutorialProgress) => {
    if (!accountId || owner.current !== accountId || next === current.current) return;
    current.current = next;
    setState(state => state?.accountId === accountId ? { ...state, progress: next } : state);
    void writeTutorialProgress(accountId, next).then(() => { if (alive.current) setSaveError(''); }).catch(() => { if (alive.current) setSaveError('教程进度保存失败；学习内容仍按正常流程保存。继续操作时会重试保存进度。'); });
  }, [accountId]);
  const event = useCallback((id: TutorialStepId) => update(advanceTutorial(current.current, id)), [update]);
  const skip = useCallback(() => { const step = TUTORIAL_STEPS[current.current.step]; if (step) update(advanceTutorial(current.current, step.id, true)); }, [update]);
  const finish = useCallback((recordId: string) => {
    const p = current.current;
    const recap = TUTORIAL_STEPS.findIndex(step => step.id === 'recap');
    update({ ...p, recordId, step: Math.max(p.step, recap), completed: p.step === recap - 1 ? [...new Set([...p.completed, 'finish' as const])] : p.completed });
  }, [update]);
  const exit = useCallback(() => router.replace({ pathname: '/info/[slug]', params: { slug: 'guide' } }), [router]);
  const restartTutorial = useCallback(() => router.replace({ pathname: '/info/[slug]', params: { slug: 'tutorial', restart: String(Date.now()) } }), [router]);
  const controller = useMemo(() => state && state.accountId === accountId ? { progress: state.progress, event, skip, finish, exit, restart: restartTutorial, scroll, scrollOffset, saveError } : null, [accountId, event, exit, finish, restartTutorial, saveError, skip, state]);
  if (error) return <Screen><TopBar title="新手教程" onBack={exit} /><CenteredState title="暂时无法开始教程" description={error} actionLabel="重试" onAction={() => setAttempt(n => n + 1)} /></Screen>;
  if (!state || !controller) return <Screen><TopBar title="新手教程" onBack={exit} /><GlobalLoadingScreen /></Screen>;
  return <TutorialContext.Provider value={controller}><View style={{ flex: 1 }}>
    {state.record ? <StudyReport record={state.record} noteCount={state.record.noteCount ?? 0} interaction="speaking" onReturn={exit} returnLabel="返回使用指南" /> : state.studyPackage ? <QuestionBankStudyScreen studyPackage={state.studyPackage} onReturn={exit} returnLabel="返回使用指南" sourceRoute="/info/tutorial" /> : null}
  </View></TutorialContext.Provider>;
}
