import { studyGuideEntry } from './study-guide-entry';
import { useAppRouter as useRouter } from '@/components/navigation/useAppRouter';
import { usePathname, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Platform, View } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { GuideBindingContext, type GuideCheckpoint, type GuidePrompt } from './GuideBindings';
import { GuideOverlay, type GuideNode } from './GuideOverlay';
import { GuideRootSurface } from './GuideRootSurface';
import { GUIDE_ENTRIES, GUIDE_FLOWS, RECORD_GUIDE, type GuideId } from './guide-flows';
import { eligibleForAutomaticGuide, emptyGuideProgress, readGuideProgress, remainingGuideSteps, writeGuideProgress, type GuideProgress } from './guide-progress';

type Tour = { id: GuideId; mode: 'manual' | 'automatic'; remaining: string[]; done: string[]; records?: boolean };
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
  const [confirmations, setConfirmations] = useState<Record<string, boolean>>({});
  const confirm = useCallback((id: string, allowed: boolean) => setConfirmations(old => old[id] === allowed ? old : { ...old, [id]: allowed }), []);
  const [focusOverride, setFocusOverride] = useState<{ step: string; target: string; text?: string; complete?: boolean }>();
  const focus = useCallback((step: string, target: string, text?: string, complete?: boolean) => setFocusOverride(old => old?.step === step && old.target === target && old.text === text && old.complete === complete ? old : { step, target, text, complete }), []);
  const [suspended, suspend] = useState(false);
  const navigationRequest = useRef(0);
  const progress = useRef<GuideProgress>(emptyGuideProgress());
  const nodes = useRef(new Map<string, GuideNode>()).current;
  const owner = useRef(account); owner.current = account;
  const active = useRef(tour); active.current = tour;
  const automatic = auth.canAccessApp !== false && eligibleForAutomaticGuide(auth.account?.createdAt);
  useEffect(() => {
    let live = true; navigationRequest.current++; pausedPath.current = undefined; active.current = undefined; setTour(undefined); checkpoint(undefined); suspend(false); setLoaded(undefined); setError(''); setFocusOverride(undefined); setConfirmations({}); progress.current = emptyGuideProgress();
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
    if (!current || current.remaining[0] !== id || loaded !== owner.current || (!skip && confirmations[id] === false)) return;
    const resumes = { ...progress.current.resumes }; delete resumes[current.records ? 'records' : current.id];
    persist(skip ? { ...progress.current, resumes, skippedSteps: [...new Set([...(progress.current.skippedSteps ?? []), id])] } : { ...progress.current, resumes, completed: [...new Set([...progress.current.completed, id])] });
    const next = { ...current, done: [...current.done, id], remaining: current.remaining.slice(1) };
    const continuing = next.remaining.length > 0 || (next.id === 'study' && id !== 'study-recap');
    active.current = continuing ? next : undefined; setTour(continuing ? next : undefined);
  }, [loaded, persist, confirmations]);
  const event = useCallback((id: string) => advance(id), [advance]);
  const rewind = useCallback((id: string) => {
    const current = active.current;
    if (!current) return;
    const steps = current.records ? RECORD_GUIDE : GUIDE_FLOWS[current.id] ?? [];
    const index = steps.findIndex(step => step.id === id);
    if (index < 0) return;
    const remaining = steps.slice(index).map(step => step.id);
    const next = { ...current, remaining, done: current.done.filter(step => !remaining.includes(step)) };
    active.current = next; setTour(next);
  }, []);

  const pause = useCallback(() => { navigationRequest.current++; pausedPath.current = currentPath.current; active.current = undefined; setTour(undefined); suspend(false); }, []);
  const exit = useCallback(() => {
    if (active.current) {
      const resumes = { ...progress.current.resumes }; delete resumes[active.current.records ? 'records' : active.current.id];
      persist({ ...progress.current, resumes, skipped: [...new Set([...progress.current.skipped, active.current.id])] });
    }
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
  const start = useCallback(async (id: string, restart = false) => {
    const records = id === 'records';
    if (records) id = 'recap';
    const entry = GUIDE_ENTRIES.find(value => value.id === id);
    if (!entry || !account || loaded !== account) return;
    pausedPath.current = undefined;
    const request = ++navigationRequest.current;
    const entrancePath = currentPath.current;
    if (entry.id === 'study') {
      try {
        const destination = await studyGuideEntry();
        if (owner.current !== account || request !== navigationRequest.current || currentPath.current !== entrancePath) return;
        const saved = !restart ? progress.current.resumes?.study : undefined;
        const done = saved?.done.filter(id => !['study-record','study-review','study-finish','study-recap','study-lookup','study-favorite'].includes(id)) ?? [];
        const next: Tour = { id: 'study', mode: 'manual', remaining: ['study-open'], done };
        active.current = next; setTour(next); checkpoint(undefined); suspend(false);
        router.push(destination);
      } catch { if (owner.current === account && request === navigationRequest.current && currentPath.current === entrancePath) setError('900句第一句暂时无法读取，请联网后重试。'); }
      return;
    }
    const previous = progress.current.resumes?.[records ? 'records' : entry.id];
    const saved = !restart && previous?.module === entry.id && !!previous.records === records ? previous : undefined;
    let remaining = (entry.id === 'export' || entry.id === 'mock-exam' || entry.id === 'recap' && !records ? undefined : saved?.remaining) ?? (records ? RECORD_GUIDE : GUIDE_FLOWS[entry.id] ?? []).map(step => step.id);
    if (entry.id === 'hotspot' && !remaining.includes('hotspot-topic')) remaining = ['hotspot-topic', ...remaining];
    if (entry.id === 'resources' && !remaining.includes('resource-open')) remaining = ['resource-open', ...remaining];
    const next: Tour = { id: entry.id, mode: 'manual', remaining, done: saved?.done ?? [], records };
    active.current = next; setTour(next); checkpoint(saved?.checkpoint); suspend(false);
    if (entry.id !== 'export') router.push((records ? '/learning-records' : entry.route) as Href);
  }, [account, checkpoint, loaded, router]);
  useEffect(() => {
    if (!tour || !account || loaded !== account) return;
    const resume = { module: tour.id, remaining: tour.remaining, done: tour.done, records: tour.records, checkpoint: checkpointData };
    const key = tour.records ? 'records' : tour.id;
    if (JSON.stringify(progress.current.resumes?.[key]) !== JSON.stringify(resume)) persist({ ...progress.current, resumes: { ...progress.current.resumes, [key]: resume } });
  }, [account, loaded, tour, checkpointData, persist]);
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
    if (returnedToEntrance) {
      const entrance = tour.id === 'hotspot' ? 'hotspot-topic' : 'resource-open';
      const next = { ...tour, done: tour.done.filter(id => id !== entrance), remaining: [entrance, ...tour.remaining.filter(id => id !== entrance)] };
      active.current = next; setTour(next); return;
    }
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
  const selectedStep = useMemo(() => tour?.remaining[0] === 'study-open' ? { id: 'study-open', title: '从一次真实学习开始', text: '正在打开900句第一句。', read: true } : (tour?.records ? RECORD_GUIDE : GUIDE_FLOWS[tour?.id ?? 'study'] ?? []).find(value => value.id === tour?.remaining[0]), [tour?.id, tour?.remaining, tour?.records]);
  const emptyRecap = (selectedStep?.id === 'recap-question' && checkpointData?.recapEmpty) || (selectedStep?.id === 'recap-record' && checkpointData?.recordsEmpty);
  const blocked = Object.values(unavailable).find(value => value.account === account && value.module === tour?.id);
  const step = useMemo(() => blocked && selectedStep ? { ...selectedStep, target: 'guide-unavailable', text: blocked.message, read: false } : emptyRecap ? { ...selectedStep, target: tour?.records ? 'recap-records-empty' : 'recap-filter', text: tour?.records ? '完成一次学习后，可在这里找回记录。' : '当前没有可打开的标注。以后留下的重点会出现在这里。', read: true }
    : selectedStep?.id === 'study-lookup' && Platform.OS === 'web' ? { ...selectedStep, text: '已开启查词，点击原文中的英文词，查看释义。' } : selectedStep, [blocked, emptyRecap, selectedStep, tour?.records]);
  const currentFocus = focusOverride?.step === step?.id && !blocked ? focusOverride : undefined;
  const optionalLabel = blocked ? ({
    'study-play': '暂不听音频，继续教学',
    'study-record': '暂不体验录音',
    'study-review': '暂不评分，继续教学',
  } as Record<string, string>)[step?.id ?? ''] : undefined;
  const canContinue = !!step && (blocked ? !!optionalLabel : !!currentFocus?.complete || !!step.read && confirmations[step.id] !== false);
  const continueStep = useCallback(() => {
    if (!step || !canContinue) return;
    if (blocked) {
      advance(step.id, true);
      if (step.id === 'study-record') advance('study-review', true);
    } else if (emptyRecap) exit();
    else event(step.id);
  }, [advance, blocked, canContinue, emptyRecap, event, exit, step]);
  const prompt = useMemo<GuidePrompt | null>(() => step && (step.id !== 'study-open' || blocked) && !!account && !suspended && loaded === account ? {
    target: currentFocus?.target ?? step.target ?? step.id,
    title: step.title ?? GUIDE_ENTRIES.find(entry => entry.id === tour?.id)?.title ?? '使用指南',
    text: currentFocus?.text ?? step.text,
    identity: `${account}:${pathname}:${step.id}`,
    reading: step.read, interactive: tour?.id === 'study', blocked: !!blocked,
    index: tour?.done.length ?? 0, total: (tour?.done.length ?? 0) + (tour?.remaining.length ?? 0), error,
    skip: exit, exit, nextLabel: optionalLabel ?? (tour?.remaining.length === 1 ? '完成教学' : undefined),
    next: canContinue ? continueStep : undefined,
  } : null, [account, loaded, blocked, error, exit, step, suspended, tour, currentFocus, pathname, optionalLabel, canContinue, continueStep]);
  const topLayer = layers.at(-1) ?? 'root';
  const surface = useCallback((layer: string) => <GuideOverlay layer={layer} nodes={nodes} prompt={layer !== 'root' && prompt && tour?.id !== 'study' ? { ...prompt, next: undefined, interactive: true } : prompt} topLayer={topLayer} />, [nodes, prompt, topLayer, tour?.id]);
  const binding = useMemo(() => ({ event, rewind, confirm, focus, availability, register, modal, surface, start, pause, exit, offer, suspend, retry, ready: !!account && loaded === account, error, target: currentFocus?.target ?? step?.target ?? step?.id, checkpoint, checkpointData, current: tour?.id, step: tour?.remaining[0] }), [account, loaded, error, event, rewind, confirm, focus, availability, register, modal, surface, start, pause, exit, offer, checkpoint, checkpointData, retry, step, tour, currentFocus]);
  return <GuideBindingContext.Provider value={binding}><View style={{ flex: 1 }}>{children}<GuideRootSurface layer="root" nodes={nodes} prompt={prompt} topLayer={topLayer} /></View></GuideBindingContext.Provider>;
}
