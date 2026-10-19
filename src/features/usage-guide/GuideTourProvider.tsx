import { useGlobalSearchParams, usePathname, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { View } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { GuideBindingContext, type GuideCheckpoint, type GuidePrompt } from './GuideBindings';
import { GuideOverlay, type GuideNode } from './GuideOverlay';
import { GuideRootSurface } from './GuideRootSurface';
import { GUIDE_ENTRIES, GUIDE_FLOWS, type GuideId } from './guide-flows';
import { readGuideProgress, writeGuideProgress } from './guide-progress';

export function GuideTourProvider({ children }: PropsWithChildren) {
  const router = useRouter(); const pathname = usePathname();
  const params = useGlobalSearchParams<{ cardId?: string; center?: string; returnTo?: string }>();
  const query = ['cardId', 'center', 'returnTo'].flatMap(key => { const value = params[key as keyof typeof params]; return typeof value === 'string' ? [`${key}=${encodeURIComponent(value)}`] : []; }).join('&');
  const resumePath = query ? `${pathname}?${query}` : pathname; const auth = useAuth();
  const account = auth.account?.accountId ?? (auth.uiAcceptanceMode ? 'ui-acceptance' : undefined);
  const [tour, setTour] = useState<{ id: GuideId; index: number; account: string; checkpoint?: GuideCheckpoint }>();
  const [legacyPrompt, setLegacy] = useState<GuidePrompt | null>(null); const [layers, setLayers] = useState<string[]>([]); const [error, setError] = useState('');
  const nodes = useRef(new Map<string, GuideNode>()).current;
  const exitGuard = useRef<((done: () => void) => void) | null>(null);
  const guardExit = useCallback((handler: ((done: () => void) => void) | null) => { exitGuard.current = handler; }, []);
  const owner = useRef(account); owner.current = account; const generation = useRef(0);
  useEffect(() => { generation.current++; setTour(undefined); setLegacy(null); setError(''); }, [account]);
  useEffect(() => () => { generation.current++; }, []);
  const register = useCallback((key: string, id: string, layer: string, node: View | null) => { if (node) nodes.set(key, { id, layer, node }); else nodes.delete(key); }, [nodes]);
  const modal = useCallback((id: string, open: boolean) => setLayers(current => open ? [...current.filter(value => value !== id), id] : current.filter(value => value !== id)), []);
  const start = useCallback(async (id: string, restart = false) => {
    const entry = GUIDE_ENTRIES.find(value => value.id === id); if (!entry || !account) return;
    const request = ++generation.current;
    if (entry.id === 'study') { setTour(undefined); router.push((restart ? '/info/tutorial?restart=1' : entry.route) as Href); return; }
    let saved; try { saved = restart ? undefined : await readGuideProgress(account, entry.id); } catch { setError('进度暂时无法读取，学习数据不受影响。'); }
    if (owner.current !== account || generation.current !== request) return;
    const complete = saved && saved.index >= (GUIDE_FLOWS[entry.id]?.length ?? 0);
    setLegacy(null); setTour({ id: entry.id, index: complete ? 0 : saved?.index ?? 0, account, checkpoint: complete ? undefined : saved?.checkpoint });
    if (entry.id !== 'export') router.push((!complete && saved?.path ? saved.path : entry.route) as Href);
  }, [account, router]);
  const pause = useCallback(() => { generation.current++; setTour(undefined); setLegacy(null); }, []);
  const exit = useCallback(() => { const done = () => { generation.current++; setTour(undefined); setLegacy(null); router.replace('/info/guide'); }; if (exitGuard.current) exitGuard.current(done); else done(); }, [router]);
  const advance = useCallback((id?: string) => setTour(current => {
    if (!current || current.account !== owner.current) return current;
    const steps = GUIDE_FLOWS[current.id] ?? [], step = steps[current.index];
    return step && (!id || step.id === id) ? { ...current, index: current.index + 1 } : current;
  }), []);
  useEffect(() => {
    if (!tour || tour.account !== account || (pathname === '/info/guide' && tour.id !== 'export')) return;
    void writeGuideProgress(tour.account, tour.id, { index: tour.index, path: resumePath, checkpoint: tour.checkpoint }).then(() => { if (owner.current === tour.account) setError(''); }).catch(() => { if (owner.current === tour.account) setError('教程进度未保存；学习内容仍按正常流程保存。'); });
  }, [account, pathname, resumePath, tour]);
  // Returning to the guide through the original back button pauses the tour.
  useEffect(() => { if (pathname === '/info/guide') setTour(undefined); }, [pathname]);
  const prompt = useMemo<GuidePrompt | null>(() => {
    if (legacyPrompt) return legacyPrompt;
    if (!tour || tour.account !== account) return null;
    const steps = GUIDE_FLOWS[tour.id] ?? [], step = steps[tour.index]; const completed = !step;
    if (tour.id === 'recap' && step?.id === 'recap-question' && tour.checkpoint?.recapEmpty) return { target: 'recap-filter', text: '还没有标注，先用 Sentence1 留下一次学习记录。', index: tour.index, total: steps.length, skip: () => advance(), exit, next: () => { void start('study'); } };
    return { target: step?.id ?? '', text: step?.text ?? '学会了，接下来按自己的节奏练习。', index: tour.index, total: steps.length, completed, error, skip: completed ? () => { void start(tour.id, true); } : () => advance(), exit, next: completed ? exit : step.read ? () => { if (step.id === 'recap-records') router.push('/learning-records'); advance(); } : undefined };
  }, [account, advance, error, exit, legacyPrompt, router, start, tour]);
  const checkpoint = useCallback((value: GuideCheckpoint) => setTour(current => current && JSON.stringify(current.checkpoint) !== JSON.stringify(value) ? { ...current, checkpoint: value } : current), []);
  const topLayer = layers.at(-1) ?? 'root';
  const surface = useCallback((layer: string) => <GuideOverlay layer={layer} nodes={nodes} prompt={prompt} topLayer={topLayer} />, [nodes, prompt, topLayer]);
  const binding = useMemo(() => ({ event: advance, guardExit, register, modal, surface, legacy: setLegacy, start, pause, checkpoint, checkpointData: tour?.checkpoint, current: tour?.id, step: tour ? GUIDE_FLOWS[tour.id]?.[tour.index]?.id : undefined }), [advance, checkpoint, guardExit, modal, pause, register, start, surface, tour]);
  return <GuideBindingContext.Provider value={binding}><View style={{ flex: 1 }}>{children}<GuideRootSurface layer="root" nodes={nodes} prompt={prompt} topLayer={topLayer} /></View></GuideBindingContext.Provider>;
}
