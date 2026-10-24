import { studyGuideEntry } from './study-guide-entry';
import { useAppRouter as useRouter } from '@/components/navigation/useAppRouter';
import { usePathname, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Platform, View } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { GuideBindingContext, type GuideCheckpoint, type GuidePrompt } from './GuideBindings';
import { GuideOverlay, type GuideNode } from './GuideOverlay';
import { GuideRootSurface } from './GuideRootSurface';
import { GUIDE_ENTRIES, GUIDE_FLOWS, type GuideId } from './guide-flows';
import { eligibleForAutomaticGuide, emptyGuideProgress, readGuideProgress, remainingGuideSteps, writeGuideProgress, type GuideProgress } from './guide-progress';

type Tour = { id: GuideId; mode: 'manual' | 'automatic'; remaining: string[]; done: string[] };
export function GuideTourProvider({ children }: PropsWithChildren) {
  const router = useRouter(), pathname = usePathname(), auth = useAuth();
  const currentPath = useRef(pathname);
  const pausedPath = useRef<string | undefined>(undefined);
  if (currentPath.current !== pathname) pausedPath.current = undefined;
  currentPath.current = pathname;
  const account = auth.canAccessApp ? auth.account?.accountId ?? (auth.uiAcceptanceMode ? 'ui-acceptance' : undefined) : undefined;
  const [loaded, setLoaded] = useState<string>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const retry = useCallback(() => setLoadAttempt(value => value + 1), []);
  const [tour, setTour] = useState<Tour>();
  const [layers, setLayers] = useState<string[]>([]);
  const [unavailable, setUnavailable] = useState<Record<string, { account: string; module: GuideId; message: string }>>({});
  const availability = useCallback((key: string, module: GuideId, message?: string) => setUnavailable(current => {
    // Cleanup belongs to the registering account; an old effect must never remove
    // a new account's registration at the same mounted component key.
    if (!message) {
      if (current[key]?.account !== account) return current;
      const next = { ...current }; delete next[key]; return next;
    }
    if (!account || owner.current !== account) return current;
    if (current[key]?.account === account && current[key]?.message === message && current[key]?.module === module) return current;
    return { ...current, [key]: { account, module, message } };
  }), [account]);
  const [checkpointData, setCheckpoint] = useState<GuideCheckpoint>();
  const checkpoint = useCallback((value?: GuideCheckpoint) => setCheckpoint(current => JSON.stringify(current) === JSON.stringify(value) ? current : value), []);
  const [error, setError] = useState('');
  const [suspended, suspend] = useState(false);
  const navigationRequest = useRef(0);
  const progress = useRef<GuideProgress>(emptyGuideProgress());
  const nodes = useRef(new Map<string, GuideNode>()).current;
  const owner = useRef(account); owner.current = account;
  const active = useRef(tour); active.current = tour;
  const automatic = auth.canAccessApp !== false && eligibleForAutomaticGuide(auth.account?.createdAt);
  useEffect(() => {
    let live = true; navigationRequest.current++; pausedPath.current = undefined; active.current = undefined; setTour(undefined); checkpoint(undefined); suspend(false); setLoaded(undefined); setError(''); progress.current = emptyGuideProgress();
    if (account) void readGuideProgress(account).then(value => { if (live && owner.current === account) { progress.current = value; setLoaded(account); } }).catch(() => { if (live) setError('教学进度暂时无法读取，请稍后重试。'); });
    return () => { live = false; };
  }, [account, checkpoint, loadAttempt]);
  const persist = useCallback((value: GuideProgress) => {
    progress.current = value;
    if (!account) return;
    void writeGuideProgress(account, value).then(() => { if (owner.current === account) setError(''); }).catch(() => { if (owner.current === account) setError('教学进度未保存，请保持本次学习并稍后重试。'); });
  }, [account]);
  const advance = useCallback((id: string, skip = false) => {
    const current = active.current;
    if (!current || current.remaining[0] !== id || loaded !== owner.current) return;
    persist(skip ? { ...progress.current, skippedSteps: [...new Set([...(progress.current.skippedSteps ?? []), id])] } : { ...progress.current, completed: [...new Set([...progress.current.completed, id])] });
    const next = { ...current, done: [...current.done, id], remaining: current.remaining.slice(1) };
    const continuing = next.remaining.length > 0 || (next.id === 'study' && id !== 'study-recap');
    active.current = continuing ? next : undefined; setTour(continuing ? next : undefined);
  }, [loaded, persist]);
  const event = useCallback((id: string) => advance(id), [advance]);
  const pause = useCallback(() => { navigationRequest.current++; pausedPath.current = currentPath.current; active.current = undefined; setTour(undefined); suspend(false); }, []);
  const exit = useCallback(() => {
    if (active.current) persist({ ...progress.current, skipped: [...new Set([...progress.current.skipped, active.current.id])] });
    pause();
  }, [pause, persist]);
  const offer = useCallback((id: GuideId, ids: string[]) => {
    if (!account || loaded !== account) return;
    const current = active.current;
    if (current && current.id !== id) return;
    let remaining = current?.mode === 'manual' ? ids.filter(step => !current.done.includes(step)) : remainingGuideSteps(ids, progress.current, id);
    // Resume at the actual entrance before teaching a detail page that is not open.
    if (!current && remaining.length) {
      const entryStep = id === 'hotspot' ? 'hotspot-topic' : id === 'resources' ? 'resource-open' : undefined;
      if (entryStep && !remaining.includes(entryStep)) remaining = [entryStep, ...remaining];
    }
    if (!current && (!automatic || !remaining.length || pausedPath.current === currentPath.current)) return;
    if (current && !remaining.length && ids.includes('study-recap')) { active.current = undefined; setTour(undefined); return; }
    if (current && JSON.stringify(current.remaining) === JSON.stringify(remaining)) return;
    const next: Tour = { id, mode: current?.mode ?? 'automatic', remaining, done: current?.done ?? [] };
    active.current = next; setTour(next);
  }, [account, loaded, automatic]);
  const start = useCallback(async (id: string) => {
    const entry = GUIDE_ENTRIES.find(value => value.id === id);
    if (!entry || !account || loaded !== account) return;
    pausedPath.current = undefined;
    const request = ++navigationRequest.current;
    if (entry.id === 'study') {
      try {
        const destination = await studyGuideEntry();
        if (owner.current !== account || request !== navigationRequest.current) return;
        const next: Tour = { id: 'study', mode: 'manual', remaining: ['study-open'], done: [] };
        active.current = next; setTour(next); checkpoint(undefined); suspend(false);
        router.push(destination);
      } catch { if (owner.current === account && request === navigationRequest.current) setError('陆空通话暂时无法读取，请联网后重试。'); }
      return;
    }
    const next: Tour = { id: entry.id, mode: 'manual', remaining: (GUIDE_FLOWS[entry.id] ?? []).map(step => step.id), done: [] };
    active.current = next; setTour(next); checkpoint(undefined); suspend(false);
    if (entry.id !== 'export') router.push(entry.route as Href);
  }, [account, checkpoint, loaded, router]);
  // Automatic module entry uses exactly the same definitions and event handling.
  useEffect(() => {
    if (tour || loaded !== account || !automatic || pausedPath.current === pathname) return;
    const entry = GUIDE_ENTRIES.find(value => value.id !== 'study' && value.id !== 'export' && pathname === value.route);
    if (entry) offer(entry.id, (GUIDE_FLOWS[entry.id] ?? []).map(step => step.id));

  }, [account, automatic, loaded, offer, pathname, router, tour]);
  useEffect(() => {
    if (!tour) return;
    const home = pathname === '/' || pathname === '/question-bank';
    const allowed = tour.id === 'study' ? home || pathname.startsWith('/question-bank/') || pathname.includes('/study')
      : tour.id === 'export' ? pathname === '/info/guide' || pathname.includes('/export')
      : tour.id === 'recap' ? pathname === '/annotations' || pathname === '/learning-records' || pathname.startsWith('/question-bank/')
      : pathname.startsWith(GUIDE_ENTRIES.find(entry => entry.id === tour.id)?.route ?? '/content/');
    const returnedToEntrance = previousPath.current !== pathname && ((tour.id === 'hotspot' && pathname === '/content/hotspot' && tour.remaining[0] !== 'hotspot-topic')
      || (tour.id === 'resources' && pathname === '/content/resources' && tour.remaining[0] === 'resource-article'));
    if (returnedToEntrance) { pause(); return; }
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
  const selectedStep = useMemo(() => tour?.remaining[0] === 'study-open' ? { id: 'study-open', title: '从一次真实学习开始', text: '正在打开陆空通话真实题目，进入后逐步教学。', read: true } : (GUIDE_FLOWS[tour?.id ?? 'study'] ?? []).find(value => value.id === tour?.remaining[0]), [tour?.id, tour?.remaining]);
  const emptyRecap = selectedStep?.id === 'recap-question' && checkpointData?.recapEmpty;
  const blocked = Object.values(unavailable).find(value => value.account === account && value.module === tour?.id);
  const step = useMemo(() => blocked && selectedStep ? { ...selectedStep, target: 'guide-unavailable', text: blocked.message, read: false } : emptyRecap ? { ...selectedStep, target: 'recap-filter', text: '还没有标注，先开始一次学习，留下自己的重点。', read: true }
    : selectedStep?.id === 'study-lookup' && Platform.OS === 'web' ? { ...selectedStep, text: '已开启查词，点击原文中的英文词，查看释义。' } : selectedStep, [blocked, emptyRecap, selectedStep]);
  const prompt = useMemo<GuidePrompt | null>(() => step && !!account && !suspended && loaded === account ? {
    target: step.target ?? step.id, title: step.title ?? GUIDE_ENTRIES.find(entry => entry.id === tour?.id)?.title ?? '使用指南', text: step.text,
    index: tour?.done.length ?? 0, total: (tour?.done.length ?? 0) + (tour?.remaining.length ?? 0), error,
    skip: exit, exit, nextLabel: blocked && tour?.remaining[0] === 'study-review' ? '暂不评分，继续教学' : undefined, next: blocked && tour?.remaining[0] === 'study-review' ? () => advance('study-review', true) : step.read ? () => {
      if (emptyRecap) { void start('study'); return; }
      event(step.id);
    } : undefined,
  } : null, [account, loaded, advance, blocked, emptyRecap, error, event, exit, start, step, suspended, tour]);
  const topLayer = layers.at(-1) ?? 'root';
  const surface = useCallback((layer: string) => <GuideOverlay layer={layer} nodes={nodes} prompt={prompt} topLayer={topLayer} />, [nodes, prompt, topLayer]);
  const binding = useMemo(() => ({ event, availability, register, modal, surface, start, pause, exit, offer, suspend, retry, ready: !!account && loaded === account, error, target: step?.target ?? step?.id, checkpoint, checkpointData, current: tour?.id, step: tour?.remaining[0] }), [account, loaded, error, event, availability, register, modal, surface, start, pause, exit, offer, checkpoint, checkpointData, retry, step, tour]);
  return <GuideBindingContext.Provider value={binding}><View style={{ flex: 1 }}>{children}<GuideRootSurface layer="root" nodes={nodes} prompt={prompt} topLayer={topLayer} /></View></GuideBindingContext.Provider>;
}
