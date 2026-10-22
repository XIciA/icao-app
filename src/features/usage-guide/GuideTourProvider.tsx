import { useAppRouter as useRouter } from '@/components/navigation/useAppRouter';
import { usePathname, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { View } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { GuideBindingContext, type GuideCheckpoint, type GuidePrompt } from './GuideBindings';
import { GuideOverlay, type GuideNode } from './GuideOverlay';
import { GuideRootSurface } from './GuideRootSurface';
import { GUIDE_ENTRIES, GUIDE_FLOWS, type GuideId } from './guide-flows';
import { eligibleForAutomaticGuide, emptyGuideProgress, readGuideProgress, remainingGuideSteps, writeGuideProgress, type GuideProgress } from './guide-progress';

type Tour = { id: GuideId; mode: 'manual' | 'automatic'; remaining: string[]; done: string[] };
export function GuideTourProvider({ children }: PropsWithChildren) {
  const router = useRouter(), pathname = usePathname(), auth = useAuth();
  const account = auth.account?.accountId ?? (auth.uiAcceptanceMode ? 'ui-acceptance' : undefined);
  const [loaded, setLoaded] = useState<string>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const retry = useCallback(() => setLoadAttempt(value => value + 1), []);
  const [tour, setTour] = useState<Tour>();
  const [layers, setLayers] = useState<string[]>([]);
  const [checkpointData, setCheckpoint] = useState<GuideCheckpoint>();
  const checkpoint = useCallback((value?: GuideCheckpoint) => setCheckpoint(current => JSON.stringify(current) === JSON.stringify(value) ? current : value), []);
  const [error, setError] = useState('');
  const [suspended, suspend] = useState(false);
  const progress = useRef<GuideProgress>(emptyGuideProgress());
  const nodes = useRef(new Map<string, GuideNode>()).current;
  const owner = useRef(account); owner.current = account;
  const active = useRef(tour); active.current = tour;
  const automatic = auth.canAccessApp !== false && eligibleForAutomaticGuide(auth.account?.createdAt);
  useEffect(() => {
    let live = true; active.current = undefined; setTour(undefined); checkpoint(undefined); suspend(false); setLoaded(undefined); setError(''); progress.current = emptyGuideProgress();
    if (account) void readGuideProgress(account).then(value => { if (live && owner.current === account) { progress.current = value; setLoaded(account); } }).catch(() => { if (live) setError('教学进度暂时无法读取，请稍后重试。'); });
    return () => { live = false; };
  }, [account, loadAttempt]);
  const persist = useCallback((value: GuideProgress) => {
    progress.current = value;
    if (!account) return;
    void writeGuideProgress(account, value).then(() => { if (owner.current === account) setError(''); }).catch(() => { if (owner.current === account) setError('教学进度未保存，请保持本次学习并稍后重试。'); });
  }, [account]);
  const event = useCallback((id: string) => {
    const current = active.current;
    if (!current || current.remaining[0] !== id || loaded !== owner.current) return;
    persist({ ...progress.current, completed: [...new Set([...progress.current.completed, id])] });
    const next = { ...current, done: [...current.done, id], remaining: current.remaining.slice(1) };
    active.current = next; setTour(next.remaining.length || next.id === 'study' ? next : undefined);
  }, [loaded, persist]);
  const pause = useCallback(() => { active.current = undefined; setTour(undefined); }, []);
  const exit = useCallback(() => {
    if (active.current) persist({ ...progress.current, skipped: [...new Set([...progress.current.skipped, active.current.id])] });
    pause();
  }, [pause, persist]);
  const offer = useCallback((id: GuideId, ids: string[]) => {
    if (!account || loaded !== account) return;
    const current = active.current;
    if (current && current.id !== id) return;
    const remaining = current?.mode === 'manual' ? ids.filter(step => !current.done.includes(step)) : remainingGuideSteps(ids, progress.current, id);
    if (!current && (!automatic || !remaining.length)) return;
    if (current && JSON.stringify(current.remaining) === JSON.stringify(remaining)) return;
    const next: Tour = { id, mode: current?.mode ?? 'automatic', remaining, done: current?.done ?? [] };
    active.current = next; setTour(next);
  }, [account, loaded, automatic]);
  const start = useCallback(async (id: string) => {
    const entry = GUIDE_ENTRIES.find(value => value.id === id);
    if (!entry || !account || loaded !== account) return;
    const next: Tour = { id: entry.id, mode: 'manual', remaining: entry.id === 'study' ? ['study-open'] : (GUIDE_FLOWS[entry.id] ?? []).map(step => step.id), done: [] };
    active.current = next; setTour(next); checkpoint(undefined);
    if (entry.id !== 'export') router.push(entry.route as Href);
  }, [account, loaded, router]);
  // Automatic module entry uses exactly the same definitions and event handling.
  useEffect(() => {
    if (tour || loaded !== account || !automatic) return;
    const entry = GUIDE_ENTRIES.find(value => value.id !== 'study' && value.id !== 'export' && value.id !== 'setup' && pathname === value.route);
    if (entry) offer(entry.id, (GUIDE_FLOWS[entry.id] ?? []).map(step => step.id));
    else if ((pathname === '/' || pathname === '/profile') && remainingGuideSteps((GUIDE_FLOWS.setup ?? []).map(step => step.id), progress.current, 'setup').length) {
      offer('setup', (GUIDE_FLOWS.setup ?? []).map(step => step.id));
      if (pathname !== '/profile') router.push('/(tabs)/profile');
    }
  }, [account, automatic, loaded, offer, pathname, router, tour]);
  useEffect(() => {
    if (!tour) return;
    const home = pathname === '/' || pathname === '/question-bank';
    const allowed = tour.id === 'study' ? home || pathname.startsWith('/question-bank/') || pathname.includes('/study')
      : tour.id === 'setup' ? home || pathname === '/profile' || pathname === '/account/profile'
      : tour.id === 'export' ? pathname === '/info/guide' || pathname.includes('/export')
      : tour.id === 'recap' ? pathname === '/annotations' || pathname === '/learning-records' || pathname.startsWith('/question-bank/')
      : pathname.startsWith(GUIDE_ENTRIES.find(entry => entry.id === tour.id)?.route ?? '/content/');
    // Route push commits after start; allow that first navigation before policing exits.
    if (previousPath.current !== pathname && !allowed) pause();
  }, [pathname, pause, tour]);
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current !== pathname && (pathname === '/info/guide' || pathname === '/auth/login')) pause();
    previousPath.current = pathname;
  }, [pathname, pause]);
  const register = useCallback((key: string, id: string, layer: string, node: View | null) => { if (node) nodes.set(key, { id, layer, node }); else nodes.delete(key); }, [nodes]);
  const modal = useCallback((id: string, open: boolean) => setLayers(current => open ? [...current.filter(value => value !== id), id] : current.filter(value => value !== id)), []);
  const selectedStep = tour?.remaining[0] === 'study-open' ? { id: 'study-open', title: '从一次真实学习开始', text: '选择题库和题目，进入学习后会逐步教学。', read: true } : (GUIDE_FLOWS[tour?.id ?? 'study'] ?? []).find(value => value.id === tour?.remaining[0]);
  const emptyRecap = selectedStep?.id === 'recap-question' && checkpointData?.recapEmpty;
  const step = emptyRecap ? { ...selectedStep, target: 'recap-filter', text: '还没有标注，先开始一次学习，留下自己的重点。', read: true } : selectedStep;
  const prompt = useMemo<GuidePrompt | null>(() => step && !suspended && loaded === account ? {
    target: step.target ?? step.id, title: step.title ?? GUIDE_ENTRIES.find(entry => entry.id === tour?.id)?.title ?? '使用指南', text: step.text,
    index: tour?.done.length ?? 0, total: (tour?.done.length ?? 0) + (tour?.remaining.length ?? 0), error,
    skip: exit, exit, next: step.read ? () => {
      if (emptyRecap) { void start('study'); return; }
      event(step.id);
      if (step.id === 'setup-bank') router.push('/(tabs)');
    } : undefined,
  } : null, [account, loaded, emptyRecap, error, event, exit, router, start, step, suspended, tour]);
  const topLayer = layers.at(-1) ?? 'root';
  const surface = useCallback((layer: string) => <GuideOverlay layer={layer} nodes={nodes} prompt={prompt} topLayer={topLayer} />, [nodes, prompt, topLayer]);
  const binding = useMemo(() => ({ event, register, modal, surface, start, pause, exit, offer, suspend, retry, ready: loaded === account, error, target: step?.target ?? step?.id, checkpoint, checkpointData, current: tour?.id, step: tour?.remaining[0] }), [account, loaded, error, event, register, modal, surface, start, pause, exit, offer, checkpointData, step, tour]);
  return <GuideBindingContext.Provider value={binding}><View style={{ flex: 1 }}>{children}<GuideRootSurface layer="root" nodes={nodes} prompt={prompt} topLayer={topLayer} /></View></GuideBindingContext.Provider>;
}
